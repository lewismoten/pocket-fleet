#include <Arduino.h>
#include <M5Cardputer.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include "esp_random.h"

// Cardputer ADV: the keyboard and 240x135 display are managed by M5Cardputer.
// No SD card, speaker, microphone, or PSRAM is required.
static constexpr const char *VERSION = "0.1.0";
static constexpr uint16_t BG=0x08C5, PANEL=0x1168, PF_CYAN=0x4F3B, PF_GOLD=0xF5E8, PF_WHITE=0xEFFF, MUTED=0x9CD3, PF_RED=0xF986, PF_GREEN=0x85F0;
static const char *stationNames[] = {"CAPTAIN","HELM","WEAPONS","ENGINEERING","SCIENCE","COMMS"};
static const char *stationIds[] = {"captain","helm","weapons","engineering","science","communications"};
static const char *stationActions[][4] = {
  {"Red alert","Yellow alert","Stand down","Order: advance"},
  {"Set course","Thrust","Turn left","Turn right"},
  {"Toggle power","Fire pulse","Fire torpedo",""},
  {"Repair system","Boost engines","Recharge shields",""},
  {"Scan sector","Scan target","Analyze anomaly",""},
  {"Request mission","Hail target","Negotiate","Transmit report"}
};
static const char *targetNames[] = {"Aster Colony","Relay Nine","Titania","Draco Raider","Vesta Station","Rigel Moon","Supply Ship","Peace Summit"};
static const char *systemNames[] = {"hull","engines","weapons","bridge","communications"};
static const char *speciesNames[] = {"human","alien","android","feline","amphibian"};
static const char *faceNames[] = {"round","long","square"};
Preferences prefs;
enum Page { ROOM, WIFI_LIST, FLEETS, BRIDGE, FORWARD, TEXT_ENTRY };
enum EntryKind { NAME, WIFI_PASSWORD, HOST_IP, FLEET_PIN, SHIP_PIN, SHIP_NAME, CREATE_PIN };
Page page=ROOM, returnPage=ROOM;
EntryKind entryKind=NAME;
String entry, entryLabel, notice="Ready for duty";
String playerId, playerName="Cardputer Cadet", ssid, wifiPassword, hostIp, fleetCode, fleetPin, shipPin, shipId="ship-1", shipName="Wayfarer", token;
String mission="Request a mission", eventText="Bridge systems ready", alert="green";
int species=0, face=0, accent=0, xp=0, missions=0, kills=0, escapes=0;
int station=0, target=0, selectedSystem=0, roomChoice=0, wifiChoice=0, fleetChoice=0, dockCount=0, wifiCount=0;
int hull=100, shields=80, energy=100, enemy=0, speed=1, heading=0, shipX=50, shipY=50;
int targetX[8]={15,45,75,84,22,38,70,95}, targetY[8]={30,15,75,36,82,65,18,92};
String wifiNames[12], dockNames[12], dockCodes[12], dockShipIds[12];
int wifiRssi[12], dockCrew[12];
bool wifiLocked[12], dockLocked[12], dockFleetLocked[12], dockShipLocked[12], online=false, aboard=false, weaponsOnline=false, missionActive=false, dirty=true;
uint32_t worldSeed=0, lastPoll=0, lastDraw=0, pulseReady=0, torpedoReady=0, engineeringReady[3]={0,0,0}, shotUntil=0;
int shotType=0, shotSide=0;

void mark(const String &message) { notice=message; dirty=true; }
String endpoint(const char *route) { return "http://"+hostIp+":8787/api/"+route; }
int httpGet(const String &url, JsonDocument &doc) {
  HTTPClient http; http.setTimeout(3000); http.begin(url); if(token.length()) http.addHeader("x-fleet-token",token);
  int code=http.GET(); if(code==200 && deserializeJson(doc,http.getStream())!=DeserializationError::Ok) code=-1;
  http.end(); return code;
}
int httpPost(const char *route, JsonDocument &request, JsonDocument *response=nullptr) {
  HTTPClient http; http.setTimeout(3000); http.begin(endpoint(route)); http.addHeader("Content-Type","application/json");
  if(token.length()) http.addHeader("x-fleet-token",token);
  String body; serializeJson(request,body); int code=http.POST(body);
  if(code==200 && response && deserializeJson(*response,http.getStream())!=DeserializationError::Ok) code=-1;
  http.end(); return code;
}
void saveProfile() {
  prefs.putString("name",playerName); prefs.putUChar("species",species); prefs.putUChar("face",face); prefs.putUChar("accent",accent);
  prefs.putInt("xp",xp); prefs.putInt("missions",missions); prefs.putInt("kills",kills); prefs.putInt("escapes",escapes);
}
void drawText(int x,int y,const String &s,uint16_t color=PF_WHITE,int size=1) {
  M5Cardputer.Display.setTextColor(color); M5Cardputer.Display.setTextSize(size); M5Cardputer.Display.setCursor(x,y); M5Cardputer.Display.print(s);
}
void header(const String &title) {
  auto &d=M5Cardputer.Display; d.fillScreen(BG); d.fillRect(0,0,240,19,PANEL); drawText(5,5,"POCKET FLEET",PF_CYAN);
  drawText(153,5,title,PF_GOLD); d.drawFastHLine(0,20,240,PF_CYAN);
}
void footer(const String &hint) {
  auto &d=M5Cardputer.Display; d.fillRect(0,119,240,16,PANEL); drawText(4,122,hint,MUTED);
}
void portrait(int x,int y,int scale=1,bool angry=false) {
  auto &d=M5Cardputer.Display; uint16_t suit=accent==0?PF_CYAN:accent==1?PF_GOLD:PF_GREEN;
  d.fillRoundRect(x+5*scale,y+24*scale,33*scale,20*scale,9*scale,suit);
  d.fillCircle(x+21*scale,y+20*scale,19*scale,PF_WHITE);
  uint16_t skin=species==2?MUTED:species==1?PF_GREEN:species==3?PF_GOLD:species==4?PF_CYAN:0xE5B3;
  d.fillCircle(x+21*scale,y+20*scale,14*scale,skin);
  if(species==3){ d.fillTriangle(x+7*scale,y+8*scale,x+13*scale,y-1*scale,x+17*scale,y+9*scale,skin); d.fillTriangle(x+25*scale,y+9*scale,x+30*scale,y-1*scale,x+36*scale,y+8*scale,skin); }
  d.fillCircle(x+15*scale,y+17*scale,2*scale,BG);d.fillCircle(x+27*scale,y+17*scale,2*scale,BG);
  if(angry){d.drawFastHLine(x+12*scale,y+12*scale,6*scale,BG);d.drawFastHLine(x+24*scale,y+12*scale,6*scale,BG);}
  if(face==1) d.drawFastHLine(x+17*scale,y+27*scale,9*scale,BG);
  else if(face==2) d.fillRect(x+18*scale,y+25*scale,7*scale,3*scale,BG);
  else d.drawArc(x+21*scale,y+23*scale,5*scale,4*scale,20,160,BG);
}
void forwardScene() {
  header("FORWARD"); auto &d=M5Cardputer.Display;
  uint32_t value=worldSeed?worldSeed:0x724ab13;
  for(int i=0;i<36;i++){value=value*1664525+1013904223;int sx=(value>>16)%240;value=value*1664525+1013904223;int sy=24+(value>>16)%91;d.drawPixel((sx-heading/4+240)%240,sy,(i%5==0)?PF_WHITE:MUTED);}
  int dx=targetX[target]-shipX,dy=targetY[target]-shipY;
  int cx=120+constrain(dx*2,-95,95),cy=69+constrain(dy,-30,30);
  if(target==3 || target==6){d.fillTriangle(cx,cy-10,cx-8,cy+7,cx+8,cy+7,PF_RED);d.drawFastHLine(cx-17,cy+8,34,PF_CYAN);}
  else if(target==1 || target==4){d.fillRect(cx-11,cy-5,22,10,MUTED);d.fillRect(cx-17,cy-2,5,4,PF_CYAN);d.fillRect(cx+12,cy-2,5,4,PF_CYAN);}
  else {uint16_t color=target==2?PF_GOLD:target==5?MUTED:PF_GREEN;d.fillCircle(cx,cy,15,color);d.drawCircle(cx,cy,17,PF_CYAN);d.drawArc(cx,cy,23,7,15,160,MUTED);}
  if(millis()<shotUntil){int px=shotSide?166:74;int py=106-(int)((shotUntil-millis())/12);if(shotType==1){d.drawLine(px,105,cx,cy,PF_RED);}else d.fillCircle(px+(cx-px)*(105-py)/80,py,2,PF_GOLD);}
  drawText(5,25,shipName,PF_CYAN);drawText(5,103,String(targetNames[target]).substring(0,22),PF_WHITE);
  footer("B BACK   A/D TARGET   Q/E STATION");
}
void draw() {
  dirty=false; lastDraw=millis(); auto &d=M5Cardputer.Display;
  if(page==FORWARD){forwardScene();return;}
  if(page==ROOM){
    header("QUARTERS");portrait(9,38,1);drawText(59,29,playerName,PF_GOLD);drawText(59,44,"Rank "+String(1+(int)sqrtf(xp/100.0f))+"  XP "+String(xp),PF_WHITE);
    drawText(59,58,String(speciesNames[species])+" / "+faceNames[face],PF_CYAN);drawText(59,72,"Missions "+String(missions)+"  Kills "+String(kills),MUTED);
    drawText(59,85,"Escapes "+String(escapes),MUTED);drawText(191,85,"FW "+String(VERSION),MUTED);
    d.fillRoundRect(4,101,232,16,4,PANEL);drawText(8,104,roomChoice==0?"> START SOLO SHIP":roomChoice==1?"> DOCK / WI-FI":"> EDIT NAME",PF_GOLD);
    footer("A/D LOOK  Q/E MENU  ENTER SELECT");return;
  }
  if(page==TEXT_ENTRY){
    header("KEYBOARD");drawText(5,30,entryLabel,PF_CYAN);d.fillRoundRect(4,51,232,27,4,PANEL);
    drawText(8,59,entry.length()?entry.substring(max(0,(int)entry.length()-29)):"_",PF_WHITE);
    drawText(5,88,notice,MUTED);footer("ENTER SAVE  DEL ERASE  ESC CANCEL");return;
  }
  if(page==WIFI_LIST){
    header("WI-FI");drawText(5,25,wifiCount?"Choose a network":"No networks found",PF_CYAN);
    for(int i=0;i<min(5,wifiCount);i++){int idx=(wifiChoice/5)*5+i;if(idx>=wifiCount)break;int y=41+i*15;
      if(idx==wifiChoice)d.fillRoundRect(2,y-2,236,14,3,PANEL);
      drawText(5,y,String(idx==wifiChoice?"> ":"  ")+wifiNames[idx].substring(0,20),idx==wifiChoice?PF_GOLD:PF_WHITE);
      drawText(204,y,String(constrain((wifiRssi[idx]+95)/12,0,4))+"b",MUTED);
    }
    footer("W/S SELECT  ENTER JOIN  B BACK");return;
  }
  if(page==FLEETS){
    header("DOCKS");drawText(4,25,online?"Host "+hostIp:"Connect to Wi-Fi first",PF_CYAN);
    if(!dockCount)drawText(6,49,"No ships. Press N to prepare one.",PF_WHITE);
    for(int i=0;i<min(4,dockCount);i++){int idx=(fleetChoice/4)*4+i;if(idx>=dockCount)break;int y=41+i*18;
      if(idx==fleetChoice)d.fillRoundRect(2,y-2,236,17,3,PANEL);
      drawText(5,y,String(idx==fleetChoice?">":" ")+dockNames[idx].substring(0,18),idx==fleetChoice?PF_GOLD:PF_WHITE);
      drawText(173,y,String(dockCrew[idx])+"/8"+(dockLocked[idx]?" L":""),MUTED);
    }
    footer("W/S SELECT  ENTER BOARD  N NEW");return;
  }
  header(stationNames[station]);
  d.fillRoundRect(3,25,234,23,4,PANEL);drawText(7,29,shipName.substring(0,12),PF_GOLD);
  drawText(122,29,alert=="red"?"RED ALERT":alert=="yellow"?"YELLOW":"ALL CLEAR",alert=="red"?PF_RED:alert=="yellow"?PF_GOLD:PF_GREEN);
  drawText(6,51,"H"+String(hull)+" S"+String(shields)+" E"+String(energy)+" SPD"+String(speed),PF_CYAN);
  drawText(6,66,"Target: "+String(targetNames[target]).substring(0,18),PF_WHITE);
  if(station==3)drawText(164,66,systemNames[selectedSystem],MUTED);
  for(int i=0;i<4;i++){const char *label=stationActions[station][i];if(!label[0])continue;int x=(i%2)*119+3,y=82+(i/2)*17;
    d.fillRoundRect(x,y,115,15,3,PANEL);drawText(x+4,y+3,String(i+1)+" "+(station==2&&i==0?(weaponsOnline?"Power down":"Power up"):String(label)).substring(0,17),i==0?PF_GOLD:PF_WHITE);
  }
  footer("Q/E STN A/D TGT V VIEW B ROOM");
}
void beginText(EntryKind kind,const String &label,const String &initial=""){
  entryKind=kind;entryLabel=label;entry=initial;returnPage=page;page=TEXT_ENTRY;dirty=true;
}
void scanWifi(){
  page=WIFI_LIST;mark("Scanning Wi-Fi...");draw();wifiCount=0;WiFi.mode(WIFI_STA);
  int found=WiFi.scanNetworks(false,true);for(int i=0;i<found&&wifiCount<12;i++){wifiNames[wifiCount]=WiFi.SSID(i);wifiRssi[wifiCount]=WiFi.RSSI(i);wifiLocked[wifiCount]=WiFi.encryptionType(i)!=WIFI_AUTH_OPEN;wifiCount++;}
  WiFi.scanDelete();wifiChoice=0;mark(wifiCount?"Select network":"No networks found");
}
void fetchDocks(){
  if(WiFi.status()!=WL_CONNECTED){mark("Wi-Fi disconnected");return;}
  DynamicJsonDocument response(4096);if(httpGet(endpoint("docks"),response)!=200){mark("Host unavailable: check IP");return;}
  dockCount=0;for(JsonObject item:response["docks"].as<JsonArray>()){
    if(dockCount>=12)break;dockNames[dockCount]=item["ship"].as<String>();dockCodes[dockCount]=item["code"].as<String>();dockShipIds[dockCount]=item["shipId"].as<String>();
    dockCrew[dockCount]=item["crew"]|0;dockFleetLocked[dockCount]=item["fleetLocked"]|false;dockShipLocked[dockCount]=item["shipLocked"]|false;
    dockLocked[dockCount]=dockFleetLocked[dockCount]||dockShipLocked[dockCount];dockCount++;
  }
  fleetChoice=0;page=FLEETS;mark(String(dockCount)+" docked ship(s)");
}
void joinDock(){
  if(dockCount<1)return;fleetCode=dockCodes[fleetChoice];shipId=dockShipIds[fleetChoice];shipName=dockNames[fleetChoice];
  if(dockFleetLocked[fleetChoice]&&!fleetPin.length()){beginText(FLEET_PIN,"Fleet PIN (4-8 digits)");return;}
  if(dockShipLocked[fleetChoice]&&!shipPin.length()){beginText(SHIP_PIN,"Ship PIN (4-8 digits)");return;}
  DynamicJsonDocument request(1024),response(256);request["code"]=fleetCode;request["shipId"]=shipId;request["pin"]=fleetPin;request["shipPin"]=shipPin;request["compact"]=true;
  JsonObject profile=request.createNestedObject("profile");profile["id"]=playerId;profile["name"]=playerName;profile["xp"]=xp;profile["missions"]=missions;profile["kills"]=kills;profile["escapes"]=escapes;
  JsonObject look=profile.createNestedObject("look");look["species"]=speciesNames[species];look["face"]=faceNames[face];look["hue"]=accent*90+80;
  int code=httpPost("join",request,&response);if(code==200){token=response["token"].as<String>();aboard=true;page=BRIDGE;mark("Boarded "+shipName);lastPoll=0;}
  else mark("Boarding rejected ("+String(code)+")");
}
void createFleet(){
  if(WiFi.status()!=WL_CONNECTED){mark("Connect Wi-Fi first");return;}
  DynamicJsonDocument request(256),response(512);request["name"]=playerName+" Fleet";request["shipName"]=shipName;request["pin"]=fleetPin;
  if(httpPost("create",request,&response)!=200){mark("Cannot create fleet");return;}
  fleetCode=response["code"].as<String>();shipId="ship-1";dockCount=1;fleetChoice=0;dockCodes[0]=fleetCode;dockShipIds[0]=shipId;dockNames[0]=shipName;dockCrew[0]=0;
  dockFleetLocked[0]=fleetPin.length()>0;dockShipLocked[0]=false;dockLocked[0]=dockFleetLocked[0];
  joinDock();
}
void connectWifi(){
  mark("Connecting to "+ssid);draw();WiFi.mode(WIFI_STA);WiFi.begin(ssid.c_str(),wifiPassword.c_str());
  uint32_t started=millis();while(WiFi.status()!=WL_CONNECTED&&millis()-started<12000)delay(100);
  if(WiFi.status()!=WL_CONNECTED){page=WIFI_LIST;mark("Wi-Fi failed; select again");return;}
  online=true;IPAddress gateway=WiFi.gatewayIP();
  if(ssid.startsWith("🚀")||ssid.startsWith("PocketFleet-")){hostIp=gateway.toString();fetchDocks();}
  else beginText(HOST_IP,"Fleet host IP",prefs.getString("host",""));
}
void finishEntry(){
  String value=entry;page=returnPage;
  switch(entryKind){
    case NAME:playerName=value.length()?value.substring(0,22):"Cardputer Cadet";saveProfile();mark("Name saved");break;
    case WIFI_PASSWORD:wifiPassword=value;connectWifi();break;
    case HOST_IP:hostIp=value;prefs.putString("host",hostIp);fetchDocks();break;
    case FLEET_PIN:fleetPin=value;joinDock();break;
    case SHIP_PIN:shipPin=value;joinDock();break;
    case SHIP_NAME:shipName=value.length()?value.substring(0,22):"Wayfarer";beginText(CREATE_PIN,"Fleet PIN (blank = public)");break;
    case CREATE_PIN:fleetPin=value;createFleet();break;
  }
}
void updateFromHost(){
  if(!aboard||WiFi.status()!=WL_CONNECTED)return;
  DynamicJsonDocument doc(8192);String url=endpoint("device")+"?code="+fleetCode+"&shipId="+shipId+"&playerId="+playerId;
  if(httpGet(url,doc)!=200){mark("Host connection lost");return;}
  JsonObject ship=doc["ship"];hull=ship["hull"]|hull;shields=ship["shields"]|shields;energy=ship["energy"]|energy;enemy=ship["enemy"]|enemy;
  speed=ship["speed"]|speed;heading=ship["heading"]|heading;shipX=ship["x"]|shipX;shipY=ship["y"]|shipY;
  weaponsOnline=ship["weaponsOnline"]|false;alert=ship["alert"].as<String>();worldSeed=doc["seed"]|worldSeed;
  mission=doc["mission"]["title"].isNull()?"Request a mission":doc["mission"]["title"].as<String>();
  String nextEvent=doc["events"][0]["text"]|"";if(nextEvent.length())eventText=nextEvent;
  JsonObject profile=doc["profile"];int hostXp=profile["xp"]|xp;if(hostXp>xp){xp=hostXp;missions=profile["missions"]|missions;kills=profile["kills"]|kills;escapes=profile["escapes"]|escapes;saveProfile();}
  for(JsonObject t:doc["targets"].as<JsonArray>()){int id=(t["id"]|0)-1;if(id>=0&&id<8){targetX[id]=t["x"]|targetX[id];targetY[id]=t["y"]|targetY[id];}}
  long long serverTime=doc["serverTime"]|0LL;pulseReady=millis()+(uint32_t)max(0LL,(ship["weapons"]["pulseReadyAt"]|0LL)-serverTime);
  torpedoReady=millis()+(uint32_t)max(0LL,(ship["weapons"]["torpedoReadyAt"]|0LL)-serverTime);
  dirty=true;
}
void action(int index){
  if(index<0||index>3)return;const char *name=stationActions[station][index];if(!name[0])return;
  if(station==2&&index>0&&(!weaponsOnline||millis()<(index==1?pulseReady:torpedoReady))){mark("Weapons warming / cooling");return;}
  if(aboard){DynamicJsonDocument request(384);request["code"]=fleetCode;request["shipId"]=shipId;request["playerId"]=playerId;
    request["station"]=stationIds[station];request["action"]=name;request["targetId"]=target+1;request["system"]=systemNames[selectedSystem];
    int result=httpPost("action",request);if(result!=200){mark("Host rejected action "+String(result));return;}updateFromHost();}
  else {
    if(station==0){alert=index==0?"red":index==1?"yellow":index==2?"green":alert;}
    if(station==1){if(index==0){heading=(int)(atan2f(targetY[target]-shipY,targetX[target]-shipX)*180/PI+360)%360;}
      if(index==1){shipX=constrain(shipX+(int)(cosf(heading*PI/180)*(3+speed*3)),0,100);shipY=constrain(shipY+(int)(sinf(heading*PI/180)*(3+speed*3)),0,100);energy=max(0,energy-speed*2);}
      if(index==2||index==3)heading=(heading+(index==2?330:30))%360;}
    if(station==2){if(index==0){weaponsOnline=!weaponsOnline;if(weaponsOnline){pulseReady=millis()+1800;torpedoReady=millis()+4500;}}
      if(index>0){shotType=index;shotSide=!shotSide;shotUntil=millis()+800;enemy=max(0,enemy-(index==1?16:35));if(enemy==0&&target==3){kills++;xp+=25;saveProfile();}if(index==1)pulseReady=millis()+2200;else torpedoReady=millis()+5000;}}
    if(station==3){if(index==0){hull=min(100,hull+15);energy=max(0,energy-10);}if(index==1)energy=min(100,energy+18);if(index==2)shields=min(100,shields+16);}
    if(station==5&&index==0){missionActive=true;mission="Escort supply ship";target=6;}
    if(station==5&&index==3&&missionActive){missions++;xp+=40;missionActive=false;mission="Request a mission";saveProfile();}
  }
  mark(name);
}
void escapePod(){
  if(aboard){DynamicJsonDocument request(256);request["code"]=fleetCode;request["shipId"]=shipId;request["playerId"]=playerId;httpPost("escape",request);aboard=false;}
  else {escapes++;xp+=5;saveProfile();}
  page=ROOM;mark("Escape pod launched");
}
void handleKey(char raw){
  char key=tolower((unsigned char)raw);
  if(page==TEXT_ENTRY){if(key==27){page=returnPage;dirty=true;return;}if(isprint((unsigned char)raw)&&entry.length()<40){entry+=raw;dirty=true;}return;}
  if(page==ROOM){
    if(key=='q')roomChoice=(roomChoice+2)%3;if(key=='e')roomChoice=(roomChoice+1)%3;
    if(key=='a')species=(species+4)%5;if(key=='d')face=(face+1)%3;if(key=='c')accent=(accent+1)%3;
    if(key=='a'||key=='d'||key=='c')saveProfile();
    if(key=='\n'){if(roomChoice==0){aboard=false;page=BRIDGE;mark("Solo ship ready");}else if(roomChoice==1){if(online&&hostIp.length())fetchDocks();else scanWifi();}else beginText(NAME,"Cadet name",playerName);}
  }else if(page==WIFI_LIST){
    if(key=='w')wifiChoice=max(0,wifiChoice-1);if(key=='s')wifiChoice=min(max(0,wifiCount-1),wifiChoice+1);
    if(key=='\n'&&wifiCount){ssid=wifiNames[wifiChoice];wifiPassword="";if(wifiLocked[wifiChoice])beginText(WIFI_PASSWORD,"Password for "+ssid);else connectWifi();}
    if(key=='b'){page=ROOM;dirty=true;}
  }else if(page==FLEETS){
    int previous=fleetChoice;
    if(key=='w')fleetChoice=max(0,fleetChoice-1);if(key=='s')fleetChoice=min(max(0,dockCount-1),fleetChoice+1);
    if(previous!=fleetChoice){fleetPin="";shipPin="";}
    if(key=='\n')joinDock();if(key=='n')beginText(SHIP_NAME,"Name your ship",shipName);
    if(key=='r')fetchDocks();if(key=='b')page=ROOM;
  }else if(page==BRIDGE||page==FORWARD){
    if(key=='q')station=(station+5)%6;if(key=='e')station=(station+1)%6;
    if(key=='a')target=(target+7)%8;if(key=='d')target=(target+1)%8;
    if(key=='v')page=page==BRIDGE?FORWARD:BRIDGE;
    if(key=='b'){page=ROOM;aboard=false;}
    if(key=='x')escapePod();
    if(key>='1'&&key<='4')action(key-'1');
    if(station==3&&key=='r')selectedSystem=(selectedSystem+1)%5;
    if(station==1){if(key=='w')action(1);if(key=='s')speed=max(0,speed-1);if(key=='f')speed=min(4,speed+1);}
  }
  dirty=true;
}
void setup(){
  Serial.begin(115200);auto config=M5.config();M5Cardputer.begin(config,true);M5Cardputer.Display.setRotation(1);
  M5Cardputer.Display.setBrightness(100);prefs.begin("pocket-fleet",false);
  playerId=prefs.getString("id","");if(!playerId.length()){playerId="card-"+String(esp_random(),HEX);prefs.putString("id",playerId);}
  playerName=prefs.getString("name","Cardputer Cadet");species=prefs.getUChar("species",0)%5;face=prefs.getUChar("face",0)%3;accent=prefs.getUChar("accent",0)%3;
  xp=prefs.getInt("xp",0);missions=prefs.getInt("missions",0);kills=prefs.getInt("kills",0);escapes=prefs.getInt("escapes",0);
  worldSeed=esp_random();WiFi.mode(WIFI_OFF);draw();Serial.printf("Pocket Fleet Cardputer ADV FW %s\n",VERSION);
}
void loop(){
  M5Cardputer.update();
  if(M5Cardputer.Keyboard.isChange()&&M5Cardputer.Keyboard.isPressed()){
    auto state=M5Cardputer.Keyboard.keysState();
    if(state.del){if(page==TEXT_ENTRY&&entry.length()){entry.remove(entry.length()-1);dirty=true;}else handleKey('b');}
    if(state.enter){if(page==TEXT_ENTRY)finishEntry();else handleKey('\n');}
    for(auto key:state.word)handleKey(key);
  }
  if(aboard&&millis()-lastPoll>2200){lastPoll=millis();updateFromHost();}
  if(page==FORWARD&&millis()-lastDraw>120)dirty=true;
  if(dirty)draw();delay(12);
}
