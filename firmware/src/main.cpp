#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <TFT_eSPI.h>
#ifdef POCKET_FLEET_CYD35C
#include <Wire.h>
#else
#include <XPT2046_Touchscreen.h>
#endif
#include <Preferences.h>
#include "esp_random.h"
#define POCKET_FLEET_FIRMWARE_VERSION "0.1.7"
#ifdef POCKET_FLEET_PUBLIC_BUILD
#include "secrets.h.example"
#else
#include "secrets.h"
#endif

TFT_eSPI screen;
Preferences preferences;
#ifdef POCKET_FLEET_CYD35C
struct TS_Point { int x, y; };
class CapacitiveTouch {
 public:
  void begin() {
    // GPIO21 is the GT911 interrupt line on this board, not the backlight.
    pinMode(21, INPUT);
    pinMode(25, OUTPUT);
    digitalWrite(25, LOW);
    delay(20);
    digitalWrite(25, HIGH);
    delay(60);
    Wire.begin(33, 32);
    Wire.setClock(400000);
    if (read(0x5D, 0x8140, nullptr, 0)) address = 0x5D;
    else if (read(0x14, 0x8140, nullptr, 0)) address = 0x14;
  }
  bool touched() {
    if (!address) return false;
    uint8_t status = 0;
    if (!read(address, 0x814E, &status, 1) || !(status & 0x80)) {
      if (millis() - lastSample > 180) pressed = false;
      return pressed;
    }
    uint8_t count = status & 0x0F;
    if (count > 0 && count <= 5) {
      uint8_t point[8];
      if (read(address, 0x814F, point, 8)) {
        latest.x = point[1] | (point[2] << 8);
        latest.y = point[3] | (point[4] << 8);
        pressed = true;
        lastSample = millis();
      }
    } else pressed = false;
    Wire.beginTransmission(address);
    Wire.write(0x81); Wire.write(0x4E); Wire.write(0);
    Wire.endTransmission();
    return pressed;
  }
  TS_Point getPoint() const { return latest; }
 private:
  uint8_t address = 0;
  bool pressed = false;
  unsigned long lastSample = 0;
  TS_Point latest = {0, 0};
  bool read(uint8_t addr, uint16_t reg, uint8_t* out, uint8_t length) {
    Wire.beginTransmission(addr);
    Wire.write(reg >> 8); Wire.write(reg & 0xFF);
    if (Wire.endTransmission(false) != 0) return false;
    if (!length) return true;
    if (Wire.requestFrom(addr, length) != length) return false;
    for (uint8_t i = 0; i < length; i++) out[i] = Wire.read();
    return true;
  }
};
CapacitiveTouch touch;
#else
SPIClass touchBus(VSPI);
XPT2046_Touchscreen touch(33, 36);
#endif
const char* stations[] = { "captain", "helm", "weapons", "engineering", "science", "communications" };
const char* actions[][4] = {
  { "Red alert", "Yellow alert", "Stand down", "Order: advance" },
  { "Set course", "Thrust", "Turn left", "Turn right" },
  { "Toggle power", "Fire pulse", "Fire torpedo", "" },
  { "Repair system", "Boost engines", "Recharge shields", "" },
  { "Scan sector", "Scan target", "Analyze anomaly", "" },
  { "Request mission", "Hail target", "Negotiate", "Transmit report" }
};
const char* helmPageTwo[] = {"Speed up","Slow down","Approach target","Evade"};
const char* helmPageThree[] = {"Dock","","",""};
const char* systems[] = {"hull","engines","weapons","bridge","communications"};
const char* wifiWords[] = {"astro","comet","cosmo","orbit","lunar","scout","spark","beeps","solar","venus","earth","pluto","titan","atlas","orion","draco","hydra","aries","virgo","vesta","ceres","rigel","astra","flare","radar","quark","laser","alien"};
#ifndef HOST_WIFI_PASSWORD
#define HOST_WIFI_PASSWORD ""
#endif
WiFiServer relay(FLEET_PORT);
int station = 0, helmPage = 0, stationTargets[6] = {1,1,1,1,1,1}, shipTargetId = 0, selectedSystem=0, hull = 100, shields = 80, energy = 100, enemy = 0, speed=1, heading=0, shipX=50, shipY=50, crewCount = 0, rankLevel = 1, profileXp = 0, escapes = 0, survivors = 0, closeCalls=0, portraitHue = 190, portraitTone = 28, portraitSpecies=0, portraitFace=0, dockCount=0, signalStrength=-80, latestBarrel=0, latestEffectTarget=0;
int systemHealth[5]={100,100,100,100,100}, targetHues[8], targetXs[8], targetYs[8], dockCrew[5], dockCapacity[5];
String profileId, shipName = "Wayfarer", shipId = SHIP_ID, missionText = "Request a mission", targetName = "Target 1", targetKind = "colony", logText = "Fleet command online", fleetCode = FLEET_CODE, fleetHost = FLEET_HOST, fleetToken, alert = "green", profileName = CREW_NAME, latestEffect, profileCache, profilePending, selectedWifiPassword, fleetPinEntered=FLEET_PIN, shipPinEntered=SHIP_PIN, hotspotName;
String targetNames[8], targetKinds[8], dockCodes[5], dockShipIds[5], dockNames[5], dockFleets[5];
bool dockFleetLocked[5], dockShipLocked[5], compatibleHost=false, ready = false, aboard = false, quarters = true, dockPage=false, forwardView = false, choosingTarget=false, weaponsOnline = false, buttonDown = false, pendingShort = false, hotspotActive=false, selectedRocketWifi=false, offlineMode=false, soloMissionActive=false;
unsigned long lastPoll = 0, lastTouch = 0, lastCredit = 0, lastDraw = 0, lastDockScan=0, lastProfileSave = 0, buttonStarted = 0, shortAt = 0, shotUntil = 0, messageUntil=0, hailUntil=0, pulseReadyLocal=0, torpedoReadyLocal=0, engineeringReadyLocal[3]={0,0,0}, tapUntil=0;
unsigned long lastShotFrame=0, observedShotUntil=0;
int lastShotX=-1,lastShotY=-1;
bool lastActionDisabled[4]={false,false,false,false};
int lastActionSeconds[4]={-1,-1,-1,-1};
uint32_t worldSeed=0;
int soloMissionTarget=1, soloMissionKind=0, soloKills=0, soloMissions=0;
const uint16_t bg = TFT_BLACK, aqua = TFT_CYAN, white = TFT_WHITE, dim = 0x8410, green = TFT_GREEN;

String endpoint(const char* path) { return String("http://") + fleetHost + ":" + FLEET_PORT + "/api/" + path; }
bool post(const char* path, const String& data) {
  HTTPClient http; http.begin(endpoint(path)); http.addHeader("Content-Type", "application/json"); http.addHeader("x-fleet-token", fleetToken);
  int status = http.POST(data); http.end(); return status >= 200 && status < 300;
}
bool joinFleet() {
  DynamicJsonDocument doc(3072);
  doc["code"] = fleetCode; doc["pin"] = fleetPinEntered; doc["shipId"] = shipId; doc["shipPin"] = shipPinEntered; doc["compact"] = true;
  JsonObject p = doc.createNestedObject("profile");
  if (profileCache.length()) { DynamicJsonDocument cached(2560); if (deserializeJson(cached,profileCache)==DeserializationError::Ok) for(JsonPair item:cached.as<JsonObject>()) p[item.key().c_str()] = item.value(); }
  p["id"] = profileId; if (!p["name"].as<String>().length()) p["name"] = CREW_NAME;
  String body; serializeJson(doc, body);
  HTTPClient http; http.begin(endpoint("join")); http.addHeader("Content-Type", "application/json");
  if (http.POST(body) != 200) { http.end(); return false; }
  StaticJsonDocument<192> response;
  bool ok = deserializeJson(response, http.getStream()) == DeserializationError::Ok;
  if (ok) fleetToken = response["token"].as<String>();
  http.end(); return ok && fleetToken.length();
}
uint32_t visualToken(){
  uint32_t h=2166136261UL;
  auto number=[&](uint32_t value){h=(h^value)*16777619UL;};
  auto label=[&](const String& value){for(unsigned int i=0;i<value.length();i++)number((uint8_t)value[i]);};
  number(worldSeed);number(hull);number(shields);number(energy);number(enemy);number(speed);number(heading);
  number(shipX);number(shipY);number(shipTargetId);number(weaponsOnline);
  for(int i=0;i<5;i++)number(systemHealth[i]);
  label(alert);label(latestEffect);label(logText);label(missionText);label(targetName);
  return h;
}
bool fetchState() {
  uint32_t before=visualToken();bool parsed=false;
  HTTPClient http; http.begin(endpoint("device") + "?code=" + fleetCode + "&shipId=" + shipId + "&playerId=" + profileId);
  http.addHeader("x-fleet-token", fleetToken);
  if (http.GET() == 200) {
    DynamicJsonDocument doc(8192);
    if (deserializeJson(doc, http.getStream()) == DeserializationError::Ok) {
      parsed=true;
      JsonObject ship = doc["ship"]; shipName = ship["name"].as<String>();worldSeed=doc["seed"]|0;
      hull = ship["hull"] | 100; shields = ship["shields"] | 80; energy = ship["energy"] | 100; enemy = ship["enemy"] | 0; alert = ship["alert"] | "green"; weaponsOnline = ship["weaponsOnline"] | false;
      shipX=ship["x"]|50;shipY=ship["y"]|50;heading=ship["heading"]|0;speed=ship["speed"]|1;shipTargetId=ship["targetId"]|0;
      for(int i=0;i<5;i++)systemHealth[i]=ship["systems"][systems[i]]|100;
      long long serverTime=doc["serverTime"]|0LL;
      long long hailAt=ship["incomingHail"]["at"]|0LL;hailUntil=hailAt>0&&serverTime-hailAt<5200?millis()+(unsigned long)max(0LL,5200LL-(serverTime-hailAt)):0;
      pulseReadyLocal=millis()+(unsigned long)max(0LL,(ship["weapons"]["pulseReadyAt"]|0LL)-serverTime);
      torpedoReadyLocal=millis()+(unsigned long)max(0LL,(ship["weapons"]["torpedoReadyAt"]|0LL)-serverTime);
      for(int i=0;i<3;i++)engineeringReadyLocal[i]=millis()+(unsigned long)max(0LL,(ship["engineeringReadyAt"][actions[3][i]]|0LL)-serverTime);
      crewCount = ship["crew"].size();
      JsonObject p = doc["profile"]; profileName = p["name"] | CREW_NAME; profileXp = p["xp"] | 0; rankLevel = 1 + (int)sqrtf(profileXp / 100.0f); escapes = p["escapes"] | 0; survivors = p["survivedExplosions"] | 0; closeCalls = p["closeCalls"] | 0;
      portraitHue = p["look"]["hue"] | 190; portraitTone = p["look"]["tone"] | 28;
      String species=p["look"]["species"]|"human";const char* speciesList[]={"human","alien","android","feline","amphibian"};for(int i=0;i<5;i++)if(species==speciesList[i])portraitSpecies=i;
      String face=p["look"]["face"]|"round";const char* faceList[]={"round","long","square"};for(int i=0;i<3;i++)if(face==faceList[i])portraitFace=i;
      String nextProfile; serializeJson(p,nextProfile); if(nextProfile!=profileCache) profilePending=nextProfile;
      if(profilePending.length() && millis()-lastProfileSave>30000) { preferences.putString("profile",profilePending);profileCache=profilePending;profilePending="";lastProfileSave=millis(); }
      missionText = doc["mission"]["title"].isNull() ? "Request a mission" : doc["mission"]["title"].as<String>();
      JsonArray targets = doc["targets"].as<JsonArray>();
      for (JsonObject target : targets) { int index = target["id"].as<int>() - 1; if (index < 0 || index >= 8) continue; targetNames[index] = target["name"].as<String>(); targetKinds[index] = target["kind"].as<String>(); targetHues[index] = target["hue"] | 190;targetXs[index]=target["x"]|50;targetYs[index]=target["y"]|50; }
      int index=(stationTargets[station]-1+8)%8;targetName=targetNames[index];targetKind=targetKinds[index];
      String incomingLog=doc["events"][0]["text"] | "Fleet command online";if(incomingLog!=logText)messageUntil=millis()+3500;logText=incomingLog;
      JsonObject effect = doc["effects"][0]; String effectKey = String(effect["tick"] | -1) + ":" + effect["kind"].as<String>();
      if (!effect["kind"].isNull() && effectKey != latestEffect) { latestEffect = effectKey;latestBarrel=effect["barrel"]|0;latestEffectTarget=effect["targetId"]|0; shotUntil = millis() + 900; }
    }
  }
  http.end();return parsed&&visualToken()!=before;
}
void vessel(int x, int y, int size, uint16_t color) {
  screen.fillTriangle(x, y-size, x-size/3, y+size/3, x+size/3, y+size/3, color);
  screen.fillTriangle(x-size/3, y, x-size, y+size/2, x-size/4, y+size/3, color);
  screen.fillTriangle(x+size/3, y, x+size, y+size/2, x+size/4, y+size/3, color);
}
const char* actionAt(int s,int slot){if(s==1&&helmPage==1)return helmPageTwo[slot];if(s==1&&helmPage==2)return helmPageThree[slot];return actions[s][slot];}
void drawCadet(int x,int y,int scale) {
  uint16_t skin=portraitSpecies==1?screen.color565(125,205,160):portraitSpecies==2?0xBDF7:portraitSpecies==3?0xD489:portraitSpecies==4?0x7CB2:screen.color565(200-portraitTone,148-portraitTone/2,110);
  uint16_t suit=screen.color565(30+portraitHue%60,70+portraitHue%100,120);
  int breath=0;
  screen.fillEllipse(x,y+46+breath,39*scale,25*scale,suit);screen.fillCircle(x,y,41*scale,0x2BCB);screen.fillCircle(x,y,35*scale,0xB71C);if(portraitFace==2)screen.fillRoundRect(x-29*scale,y-30*scale,58*scale,61*scale,8,skin);else screen.fillEllipse(x,y,portraitFace==1?24*scale:29*scale,portraitFace==1?34*scale:29*scale,skin);
  if(portraitSpecies==1){screen.drawLine(x-23*scale,y-20*scale,x-28*scale,y-34*scale,skin);screen.drawLine(x+23*scale,y-20*scale,x+28*scale,y-34*scale,skin);}
  if(portraitSpecies==3){screen.fillTriangle(x-26*scale,y-15*scale,x-24*scale,y-30*scale,x-13*scale,y-22*scale,skin);screen.fillTriangle(x+26*scale,y-15*scale,x+24*scale,y-30*scale,x+13*scale,y-22*scale,skin);}
  bool blink=false;
  if(blink){screen.drawFastHLine(x-18*scale,y-1*scale,9*scale,0x1A49);screen.drawFastHLine(x+9*scale,y-1*scale,9*scale,0x1A49);}
  else{screen.fillEllipse(x-14*scale,y-1*scale,3*scale,5*scale,0x1A49);screen.fillEllipse(x+14*scale,y-1*scale,3*scale,5*scale,0x1A49);}
  screen.drawArc(x,y+7*scale,8*scale,7*scale,20,160,0x7950,skin);
}
void drawForward(int top, int height) {
  screen.fillRect(7,top,306,height,0x0843);
  String key=String("stars:")+worldSeed;uint32_t n=2166136261UL;for(unsigned i=0;i<key.length();i++)n=(n^key[i])*16777619UL;
  for(int i=0;i<105;i++){n=n*1664525UL+1013904223UL;int bx=((uint64_t)n*320)>>32;n=n*1664525UL+1013904223UL;int by=((uint64_t)n*180)>>32;int px=((bx-(shipX*17/10))%320+320)%320,py=((by-(shipY*5/4))%180+180)%180;screen.drawPixel(px,top+py*height/180,i%14==0?TFT_WHITE:0x8CD3);}
  int id=shipTargetId>0?shipTargetId:1,index=(id-1+8)%8,x=175,y=top+height/2,size=height>100?36:20;
  for(int j=0;j<8;j++){if(j==index)continue;int dx=targetXs[j]-targetXs[index],dy=targetYs[j]-targetYs[index];if(dx*dx+dy*dy>38*38)continue;int ox=175+dx*24/10,oy=top+(90+dy*18/10)*height/180;if(ox<12||ox>308||oy<top+5||oy>top+height-8)continue;if(targetKinds[j]=="ship")vessel(ox,oy,5,0xAE7B);else if(targetKinds[j]=="station")screen.drawEllipse(ox,oy,8,4,0xB6DC);else screen.fillCircle(ox,oy,5,screen.color565(70+targetHues[j]%100,110,170));}
  if(targetKinds[index]=="ship")vessel(x,y,size,0xAE7B);
  else if(targetKinds[index]=="station"){screen.drawEllipse(x,y,size,size/2,0xB6DC);screen.fillRect(x-size/2,y-5,size,10,0x6B10);}
  else if(targetKinds[index]=="nebula"){screen.fillEllipse(x,y,size*2,size/2,0x422E);screen.fillEllipse(x+12,y-4,size,size/3,0x738F);}
  else{
    uint16_t color=screen.color565(75+targetHues[index]%100,110,170);screen.fillCircle(x,y,size,color);
    if(id%3==0)screen.drawEllipse(x,y,size+14,size/3,TFT_ORANGE);
    for(int band=-size/2;band<size/2;band+=max(3,size/5)){int width=sqrtf(size*size-band*band);screen.drawFastHLine(x-width,y+band,2*width,screen.color565(90+targetHues[index]%60,145,170));}
    if(id%4==0){screen.fillEllipse(x,y-size+4,size/2,4,0xE71C);screen.fillEllipse(x,y+size-4,size/2,4,0xE71C);}
    if(id%3==0)screen.drawEllipse(x,y,size+14,size/3,0xEF5B);
  }
  if(enemy>0){screen.drawRect(x-size-7,y-size-7,size*2+14,size*2+14,TFT_RED);screen.setTextColor(TFT_RED,0x0843);screen.drawString("HOSTILE "+String(enemy)+"%",15,top+5,1);}
  if(millis()<hailUntil){int hx=276,hy=top+height/2-7;screen.fillRect(239,top+6,72,height>100?91:72,0x00E3);screen.drawRect(239,top+6,72,height>100?91:72,TFT_RED);screen.fillCircle(hx,hy,23,0x6B4D);screen.fillCircle(hx,hy,17,0x9E9B);screen.fillCircle(hx-6,hy-3,2,0x10A2);screen.fillCircle(hx+6,hy-3,2,0x10A2);screen.drawLine(hx-12,hy-9,hx-3,hy-5,TFT_BLACK);screen.drawLine(hx+3,hy-5,hx+12,hy-9,TFT_BLACK);if(millis()%500<260)screen.fillCircle(hx,hy+9,5,0x5828);else screen.drawFastHLine(hx-5,hy+9,10,0x5828);screen.setTextColor(TFT_RED,0x00E3);screen.drawString("INCOMING",246,top+height-15,1);}
  if(millis()<shotUntil){int sx=latestBarrel%2?250:70,ex=x,ey=y;if(latestEffectTarget>0&&latestEffectTarget<=8&&latestEffectTarget!=id){int aim=latestEffectTarget-1;ex=constrain(175+(targetXs[aim]-targetXs[index])*24/10,16,304);ey=constrain(top+(90+(targetYs[aim]-targetYs[index])*18/10)*height/180,top+7,top+height-7);}int progress=constrain((int)(900-(shotUntil-millis())),0,900),px=sx+(ex-sx)*progress/900,py=top+height-4+(ey-(top+height-4))*progress/900;if(latestEffect.endsWith(":pulse"))screen.drawLine(sx,top+height-4,px,py,TFT_CYAN);else if(latestEffect.endsWith(":torpedo"))screen.fillCircle(px,py,3,TFT_ORANGE);else if(latestEffect.endsWith(":explosion"))screen.drawCircle(x,y,size+13,TFT_ORANGE);}
  screen.drawFastHLine(154,top+height/2,12,0x632C);screen.drawFastVLine(160,top+height/2-6,12,0x632C);
  screen.setTextColor(0xAEFC,0x0843);screen.drawString(targetNames[index].substring(0,18),13,top+height-16,1);
}
void updateShotAnimation(){
  if(!shotUntil||quarters||choosingTarget||(!forwardView&&station!=0))return;
  unsigned long now=millis();if(now-lastShotFrame<45)return;lastShotFrame=now;
  int top=29,height=forwardView?188:86;
  if(now>=shotUntil){shotUntil=0;observedShotUntil=0;lastShotX=-1;drawForward(top,height);return;}
  if(observedShotUntil!=shotUntil){observedShotUntil=shotUntil;lastShotX=-1;}
  int id=shipTargetId>0?shipTargetId:1,index=(id-1+8)%8;
  int sx=latestBarrel%2?250:70,sy=top+height-4,ex=175,ey=top+height/2;
  if(latestEffectTarget>0&&latestEffectTarget<=8&&latestEffectTarget!=id){int aim=latestEffectTarget-1;ex=constrain(175+(targetXs[aim]-targetXs[index])*24/10,16,304);ey=constrain(top+(90+(targetYs[aim]-targetYs[index])*18/10)*height/180,top+7,top+height-7);}
  int progress=constrain((int)(900-(shotUntil-now)),0,900),px=sx+(ex-sx)*progress/900,py=sy+(ey-sy)*progress/900;
  if(latestEffect.endsWith(":torpedo")){if(lastShotX>=0)screen.fillCircle(lastShotX,lastShotY,4,0x0843);screen.fillCircle(px,py,3,TFT_ORANGE);lastShotX=px;lastShotY=py;}
  else if(latestEffect.endsWith(":pulse"))screen.drawLine(sx,sy,px,py,TFT_CYAN);
  else if(latestEffect.endsWith(":explosion"))screen.drawCircle(ex,ey,5+progress/45,TFT_ORANGE);
}
unsigned long cooldownLeft(int s,const char* action){if(s==2&&String(action)=="Fire pulse")return millis()<pulseReadyLocal?pulseReadyLocal-millis():0;if(s==2&&String(action)=="Fire torpedo")return millis()<torpedoReadyLocal?torpedoReadyLocal-millis():0;if(s==3)for(int i=0;i<3;i++)if(String(action)==actions[3][i])return millis()<engineeringReadyLocal[i]?engineeringReadyLocal[i]-millis():0;return 0;}
void drawActionTimer(int slot, unsigned long remain, uint16_t fill){
  int y=144+slot*21,seconds=(remain+999)/1000;
  if(lastActionSeconds[slot]!=seconds){screen.fillRect(266,y+1,41,14,fill);if(seconds){screen.setTextColor(dim,fill);screen.drawRightString(String(seconds)+"s",304,y+3,1);}lastActionSeconds[slot]=seconds;}
  screen.fillRect(10,y+16,299,2,0x3186);
  int total=station==2&&slot==2?7000:station==2?2000:8000;
  screen.fillRect(10,y+16,299*(total-(int)min((unsigned long)total,remain))/total,2,0x5D16);
}
void drawActionRow(int slot){
  const char* action=actionAt(station,slot);if(!action[0])return;
  int y=144+slot*21;unsigned long remain=cooldownLeft(station,action);
  bool disabled=remain>0||(station==2&&slot>0&&!weaponsOnline);
  uint16_t fill=disabled?0x10A3:0x18C5;
  screen.fillRect(8,y,304,19,fill);screen.drawRect(8,y,304,19,0x4D14);
  screen.setTextColor(disabled?dim:aqua,fill);
  String label=station==2&&slot==0?(weaponsOnline?"Power down":"Power up"):String(action);
  screen.drawString(String(slot+1)+"  "+label,16,y+1,2);
  lastActionDisabled[slot]=disabled;lastActionSeconds[slot]=-1;
  drawActionTimer(slot,remain,fill);
}
void updateActionTimers(){
  if(quarters||choosingTarget||forwardView||(station!=2&&station!=3))return;
  for(int slot=0;slot<4;slot++){
    const char* action=actionAt(station,slot);if(!action[0])continue;
    unsigned long remain=cooldownLeft(station,action);
    bool disabled=remain>0||(station==2&&slot>0&&!weaponsOnline);
    if(disabled!=lastActionDisabled[slot])drawActionRow(slot);
    else if(remain)drawActionTimer(slot,remain,disabled?0x10A3:0x18C5);
  }
}
void draw() {
  screen.fillScreen(bg);screen.setTextColor(aqua,bg);screen.drawString(quarters&&dockPage?"DOCKED SHIPS":station==1&&!forwardView?"PAGE "+String(helmPage+1)+"/3 >":"POCKET FLEET",8,6,2);
  if(quarters){
    screen.setTextColor(white,bg);screen.drawRightString(dockPage?"MY ROOM >":"DOCK >",310,6,2);
    if(dockPage){screen.setTextColor(compatibleHost?dim:TFT_RED,bg);screen.drawString(offlineMode?"OFFLINE / SOLO READY":compatibleHost?"SIGNAL "+String(signalStrength)+" dBm / READY":"HOST INCOMPATIBLE / OFFLINE",10,31,1);
      if(!dockCount){screen.setTextColor(white,bg);screen.drawString(offlineMode?"No network connected":"No ships docked on this host",12,74,2);screen.drawString(offlineMode?"Connect to find fleets":"Tap below to refresh",12,100,2);}
      for(int i=0;i<dockCount&&i<4;i++){int y=47+i*35;screen.fillRect(8,y,304,31,0x10C5);screen.setTextColor(white,0x10C5);screen.drawString(dockNames[i].substring(0,22),15,y+2,2);screen.setTextColor(aqua,0x10C5);screen.drawString(String(dockCrew[i])+"/"+String(dockCapacity[i])+" "+(dockCrew[i]>=dockCapacity[i]?"FULL ":dockFleetLocked[i]||dockShipLocked[i]?"LOCK ":"OPEN ")+dockFleets[i].substring(0,9),15,y+19,1);int bars=constrain((signalStrength+95)/10,0,4);for(int k=0;k<4;k++)screen.fillRect(275+k*8,y+24-k*4,5,4+k*4,k<bars?TFT_GREEN:0x3186);}
      screen.fillRect(8,193,304,31,0x18C5);screen.setTextColor(aqua,0x18C5);screen.drawCentreString(offlineMode?"CONNECT TO WI-FI":"PREPARE MY SHIP / BROADCAST",160,201,2);
    }else{
      drawCadet(76,82,1);screen.setTextColor(aqua,bg);screen.drawString(profileName.substring(0,18)+(rankLevel>=2?" *":""),139,51,2);screen.drawString("LVL "+String(rankLevel)+"  "+String(profileXp)+" XP",139,79,2);screen.drawString("SOLO "+String(soloMissions)+" MISSIONS / "+String(soloKills)+" KILLS",139,103,1);screen.setTextColor(TFT_YELLOW,bg);screen.drawString("FW " POCKET_FLEET_FIRMWARE_VERSION,139,120,2);screen.setTextColor(white,bg);screen.drawString("PODS "+String(escapes)+"  BLASTS "+String(survivors),12,159,2);screen.setTextColor(dim,bg);screen.drawString("TAP TOP: SPECIES / LOW: FACE",12,178,1);
      screen.fillRoundRect(9,194,302,32,4,0x18C5);screen.setTextColor(aqua,0x18C5);screen.drawCentreString(offlineMode?"START SOLO SHIP":fleetCode.length()?"BOARD BRIDGE":"BROWSE DOCKS",160,202,2);
    }
    screen.fillRect(0,232,320,8,0x1767);screen.setTextColor(TFT_WHITE,0x1767);screen.drawRightString("FW " POCKET_FLEET_FIRMWARE_VERSION,312,232,1);if(millis()<tapUntil)screen.drawRect(1,1,318,238,TFT_GREEN);return;
  }
  if(choosingTarget){
    screen.setTextColor(white,bg);screen.drawRightString("BACK >",310,6,2);
    screen.setTextColor(aqua,bg);screen.drawString(station==1?"CHOOSE COURSE":"CHOOSE TARGET",10,27,2);
    for(int i=0;i<8;i++){
      int y=47+i*22;bool selected=stationTargets[station]==i+1;
      uint16_t fill=selected?0x2550:0x10C5;screen.fillRect(8,y,304,20,fill);
      screen.setTextColor(selected?TFT_YELLOW:white,fill);screen.drawString(String(i+1)+"  "+targetNames[i].substring(0,17),14,y+2,2);
      screen.setTextColor(aqua,fill);screen.drawRightString(targetKinds[i].substring(0,7),306,y+5,1);
    }
    screen.setTextColor(dim,bg);screen.drawString("Selection stays local until SET COURSE",8,225,1);
    if(millis()<tapUntil)screen.drawRect(1,1,318,238,TFT_GREEN);
    return;
  }
  String stationTitle=stations[station];stationTitle.toUpperCase();screen.setTextColor(white,bg);screen.drawRightString(forwardView?"FORWARD >":stationTitle+" >",310,6,2);if(offlineMode){screen.setTextColor(TFT_YELLOW,bg);screen.drawString("SOLO",8,20,1);}
  if(forwardView){drawForward(29,188);screen.setTextColor(aqua,bg);screen.drawString("H"+String(hull)+" S"+String(shields)+" E"+String(energy),10,219,1);}
  else{
    if(station==0)drawForward(29,86);
    else{screen.fillRect(7,29,306,86,0x0843);
      if(station==1||station==4){for(int r=16;r<=48;r+=16)screen.drawCircle(160,72,r,0x2BCB);float angle=station==1?heading*PI/180.0f:millis()/450.0f;screen.drawLine(160,72,160+38*cosf(angle),72+38*sinf(angle),aqua);vessel(160,72,11,white);screen.setTextColor(white,0x0843);screen.drawString("HDG "+String(heading)+"  SPD "+String(speed)+"  X"+String(shipX)+" Y"+String(shipY),13,100,1);if(station==1){screen.setTextColor(aqua,0x0843);screen.drawString("^",156,32,2);screen.drawString("v",156,84,2);screen.drawString("<",94,63,2);screen.drawString(">",208,63,2);}}
      else if(station==2){screen.drawCircle(160,72,38,weaponsOnline?TFT_RED:dim);screen.drawFastHLine(110,72,100,weaponsOnline?TFT_RED:dim);screen.drawFastVLine(160,31,82,weaponsOnline?TFT_RED:dim);vessel(160,72,14,enemy?TFT_RED:white);screen.setTextColor(weaponsOnline?TFT_RED:dim,0x0843);screen.drawString(weaponsOnline?"ARMED":"SAFE - POWER UP",17,98,1);}
      else if(station==3){int nx[]={160,160,260,160,60},ny[]={70,98,70,42,70};for(int i=0;i<5;i++)screen.drawLine(160,70,nx[i],ny[i],0x3B4D);for(int i=0;i<5;i++){uint16_t color=systemHealth[i]<35?TFT_RED:systemHealth[i]<70?TFT_YELLOW:TFT_GREEN;screen.fillCircle(nx[i],ny[i],i==selectedSystem?15:12,color);screen.drawCircle(nx[i],ny[i],i==selectedSystem?15:12,TFT_WHITE);screen.setTextColor(bg,color);String shortName=String(systems[i]).substring(0,3);shortName.toUpperCase();screen.drawCentreString(shortName,nx[i],ny[i]-4,1);}}
      else {bool incoming=millis()<messageUntil;for(int x=15;x<305;x+=3){int y=72+(incoming?12*sinf(x*.14f+millis()/90.0f):2*sinf(x*.06f+millis()/500.0f));screen.drawLine(x,y,x+3,y,aqua);}screen.setTextColor(white,0x0843);if(station==5)screen.drawString(logText.substring(0,42),16,37,1);screen.drawString(incoming?"INCOMING MESSAGE":offlineMode?"SOLO CHANNEL":"FLEET CHANNEL",16,98,1);}
    }
    int index=(stationTargets[station]-1+8)%8;screen.setTextColor(aqua,bg);screen.drawString("H"+String(hull)+" S"+String(shields)+" E"+String(energy),8,121,2);String selection=station==3?String(systems[selectedSystem]):station==1?"CHOOSE "+targetNames[index].substring(0,8):targetNames[index].substring(0,16);if(station==3)selection.toUpperCase();screen.drawRightString(selection+" >",311,121,2);
    for(int i=0;i<4;i++)drawActionRow(i);
  }
  screen.fillRect(0,232,320,8,alert=="red"?TFT_RED:alert=="yellow"?TFT_YELLOW:0x1767);screen.setTextColor(TFT_WHITE,alert=="red"?TFT_RED:alert=="yellow"?TFT_YELLOW:0x1767);screen.drawString("POD / HOLD BOOT",8,231,1);if(millis()<tapUntil)screen.drawRect(1,1,318,238,TFT_GREEN);
}
void saveLook();
void startSolo() {
  offlineMode=true; aboard=true; quarters=false; dockPage=false; forwardView=false;
  station=0; helmPage=0; shipName="Cadet Solo"; crewCount=1;
  hull=100; shields=80; energy=100; speed=1; heading=0; shipX=50; shipY=50;
  weaponsOnline=false; enemy=0; alert="green"; soloMissionActive=false;
  worldSeed=esp_random(); uint32_t n=worldSeed;
  const char* names[]={"Aster","Luna Outpost","Raider","Port Vega","Ceres","Corsair","Blue Veil","New Dawn"};
  const char* kinds[]={"planet","colony","ship","station","planet","ship","nebula","colony"};
  for(int i=0;i<8;i++){n=n*747796405UL+2891336453UL;targetXs[i]=18+(n%65);n=n*747796405UL+2891336453UL;targetYs[i]=18+(n%65);targetHues[i]=(n>>8)%300;targetNames[i]=names[i];targetKinds[i]=kinds[i];}
  for(int i=0;i<6;i++)stationTargets[i]=1;
  shipTargetId=1;missionText="Request a mission";logText="Solo ship ready. Request mission.";
  draw();
}
void completeSoloMission(const String& summary) {
  soloMissionActive=false;soloMissions++;profileXp+=80;rankLevel=1+(int)sqrtf(profileXp/100.0f);
  missionText="Request a mission";logText=summary+" +80 XP";messageUntil=millis()+3500;saveLook();
}
void sendSoloAction(const String& action) {
  int target=(stationTargets[station]-1+8)%8;
  if(action=="Red alert")alert="red";
  else if(action=="Yellow alert")alert="yellow";
  else if(action=="Stand down")alert="green";
  else if(action=="Set course"){shipTargetId=target+1;logText="Course set: "+targetNames[target];}
  else if(action=="Turn left")heading=(heading+345)%360;
  else if(action=="Turn right")heading=(heading+15)%360;
  else if(action=="Move left")shipX=max(0,shipX-2);
  else if(action=="Move right")shipX=min(100,shipX+2);
  else if(action=="Move up")shipY=max(0,shipY-2);
  else if(action=="Move down")shipY=min(100,shipY+2);
  else if(action=="Speed up")speed=min(5,speed+1);
  else if(action=="Slow down")speed=max(0,speed-1);
  else if(action=="Thrust"||action=="Approach target"){
    int aim=shipTargetId>0?shipTargetId-1:target;
    int step=action=="Thrust"?max(1,speed):6;
    shipX+=constrain(targetXs[aim]-shipX,-step,step);shipY+=constrain(targetYs[aim]-shipY,-step,step);
    energy=max(0,energy-1);logText="Approaching "+targetNames[aim];
  }
  else if(action=="Evade"){shields=max(0,shields-2);shipX=constrain(shipX+5,0,100);logText="Evasive maneuver";}
  else if(action=="Dock"){
    int aim=shipTargetId>0?shipTargetId-1:target;
    if(abs(shipX-targetXs[aim])>7||abs(shipY-targetYs[aim])>7)logText="Move closer to dock";
    else if(soloMissionActive&&soloMissionKind==0&&aim+1==soloMissionTarget)completeSoloMission("Supplies delivered");
    else logText="Docked at "+targetNames[aim];
  }
  else if(action=="Toggle power"){
    weaponsOnline=!weaponsOnline;
    if(weaponsOnline){pulseReadyLocal=millis()+2000;torpedoReadyLocal=millis()+7000;}
    logText=weaponsOnline?"Weapons charging":"Weapons powered down";
  }
  else if(action=="Fire pulse"||action=="Fire torpedo"){
    bool torpedo=action=="Fire torpedo";
    if(!weaponsOnline)logText="Power up weapons first";
    else if(cooldownLeft(2,action.c_str()))logText="Weapon charging";
    else{
      int damage=torpedo?50:25;
      if(torpedo)torpedoReadyLocal=millis()+7000;else pulseReadyLocal=millis()+2000;
      latestBarrel=(latestBarrel+1)%2;latestEffectTarget=stationTargets[station];latestEffect=torpedo?"solo:torpedo":"solo:pulse";shotUntil=millis()+900;
      if(soloMissionActive&&soloMissionKind==1&&stationTargets[station]==soloMissionTarget){enemy=max(0,enemy-damage);logText="Hostile hull "+String(enemy)+"%";if(!enemy){soloKills++;completeSoloMission("Raider stopped");}}
      else logText="Shot missed mission target";
    }
  }
  else if(action=="Repair system"){
    if(cooldownLeft(3,action.c_str()))logText="Repair team cooling down";
    else{systemHealth[selectedSystem]=min(100,systemHealth[selectedSystem]+18);if(selectedSystem==0)hull=min(100,hull+18);engineeringReadyLocal[0]=millis()+8000;logText="Repaired "+String(systems[selectedSystem]);}
  }
  else if(action=="Boost engines"){if(cooldownLeft(3,action.c_str()))logText="Engines cooling down";else{speed=min(5,speed+1);engineeringReadyLocal[1]=millis()+8000;logText="Engines boosted";}}
  else if(action=="Recharge shields"){if(cooldownLeft(3,action.c_str()))logText="Shields cooling down";else{shields=min(100,shields+20);engineeringReadyLocal[2]=millis()+8000;logText="Shields recharged";}}
  else if(action=="Request mission"){
    if(soloMissionActive)logText="Finish current mission first";
    else{soloMissionKind=soloMissions%2;soloMissionTarget=soloMissionKind?3:2;soloMissionActive=true;enemy=soloMissionKind?100:0;missionText=soloMissionKind?"Stop the raider":"Supply Luna Outpost";logText=missionText+" / target "+String(soloMissionTarget);messageUntil=millis()+3500;}
  }
  else if(action=="Transmit report")logText=soloMissionActive?missionText:"No active mission";
  else if(action=="Hail target")logText="Hailing "+targetNames[target];
  else if(action=="Negotiate")logText="No reply on this channel";
  else if(action=="Scan sector"||action=="Scan target"||action=="Analyze anomaly")logText="Scan: "+targetNames[target]+" / "+targetKinds[target];
  else logText=action;
  draw();
}
void sendAction(const char* action) {
  if(offlineMode){sendSoloAction(action);return;}
  if (station==2 && !weaponsOnline && (String(action)=="Fire pulse" || String(action)=="Fire torpedo")) { logText="Power up weapons first";draw();return; }
  if(cooldownLeft(station,action)){logText="System charging";draw();return;}
  StaticJsonDocument<384> doc; doc["code"] = fleetCode; doc["playerId"] = profileId;
  doc["shipId"] = shipId; doc["station"] = stations[station]; doc["action"] = action; doc["targetId"] = stationTargets[station];doc["system"]=systems[selectedSystem];
  String body; serializeJson(doc, body); if (!post("action", body)) { logText = "Host rejected action"; }
  fetchState(); draw();
}
void leaveBridge(bool eject) {
  if (!aboard) { quarters=true; draw(); return; }
  if(offlineMode){aboard=false;quarters=true;forwardView=false;if(eject){escapes++;saveLook();}draw();return;}
  StaticJsonDocument<160> doc;doc["code"]=fleetCode;doc["playerId"]=profileId;doc["shipId"]=shipId;
  String body;serializeJson(doc,body);
  if (post(eject?"escape":"leave",body)) { aboard=false;quarters=true;forwardView=false;fetchState();if(profilePending.length()){preferences.putString("profile",profilePending);profileCache=profilePending;profilePending="";lastProfileSave=millis();}draw(); }
}
void boardBridge() { if(offlineMode){startSolo();return;}if(!fleetCode.length()){dockPage=true;draw();return;}if (joinFleet()) { aboard=true;quarters=false;dockPage=false;fetchState();draw();lastCredit=millis(); }else{logText="Boarding denied";draw();} }
int touchY() {
  TS_Point p = touch.getPoint();
#ifdef POCKET_FLEET_CYD35C
  return constrain(319 - p.x - 40, 0, 239);
#else
  return constrain(map(p.y, 200, 3800, 0, 240), 0, 239);
#endif
}
int touchX(){TS_Point p=touch.getPoint();
#ifdef POCKET_FLEET_CYD35C
  return constrain(p.y - 80, 0, 319);
#else
  return constrain(map(p.x,200,3800,0,320),0,319);
#endif
}
void waitTouchRelease(){unsigned long started=millis();while(touch.touched()&&millis()-started<1500)delay(20);}
String inputText(const String& title,bool digitsOnly=false,String initial=""){
  String value=initial;bool lowerCase=false;const String letters="1234567890QWERTYUIOPASDFGHJKLZXCVBNM-_.!";
  while(true){screen.fillScreen(bg);screen.setTextColor(aqua,bg);screen.drawString(title.substring(0,27),8,8,2);screen.setTextColor(white,bg);screen.drawString(value.length()?value:(title=="WI-FI PASSWORD"?"Enter password or cancel":"(empty = open / default)"),10,37,2);
    String keys=digitsOnly?"1234567890":letters;if(lowerCase)keys.toLowerCase();
    for(int i=0;i<keys.length();i++){int x=7+(i%10)*31,y=70+(i/10)*32;screen.fillRect(x,y,29,29,0x18C5);screen.setTextColor(aqua,0x18C5);screen.drawCentreString(String(keys[i]),x+14,y+6,2);}
    screen.fillRect(6,207,92,28,0x18C5);screen.fillRect(104,207,106,28,0x18C5);screen.fillRect(216,207,98,28,0x18C5);screen.setTextColor(aqua,0x18C5);screen.drawCentreString(digitsOnly?"CLEAR":"Aa",52,213,2);screen.drawCentreString(value.length()?"DELETE":"CANCEL",157,213,2);screen.drawCentreString("DONE",265,213,2);
    while(!touch.touched())delay(15);int x=touchX(),y=touchY();waitTouchRelease();
    if(y>=207){if(x<100){if(digitsOnly)value="";else lowerCase=!lowerCase;}else if(x<215){if(value.length())value.remove(value.length()-1);else return "";}else return value;}
    else if(y>=70&&y<198){int col=(x-7)/31,row=(y-70)/32,index=row*10+col;if(col>=0&&col<10&&index>=0&&index<keys.length()&&value.length()<30)value+=keys[index];}
  }
}
String chooseNetwork(){
  if(strlen(WIFI_NAME)){selectedWifiPassword=WIFI_PASSWORD;String name=WIFI_NAME;selectedRocketWifi=name.startsWith(String(u8"🚀"))||name.startsWith("PocketFleet-");return name;}
  bool showAll=false;
  while(true){screen.fillScreen(bg);screen.setTextColor(aqua,bg);screen.drawString(showAll?"LOCAL WI-FI / SCAN":"ROCKET DOCKS / SCAN",8,8,2);screen.drawRightString(showAll?"ROCKETS >":"ALL WI-FI >",311,8,1);int found=WiFi.scanNetworks(),count=0;String names[6];int signal[6];bool locked[6];
    for(int i=0;i<found&&count<6;i++){String name=WiFi.SSID(i);if(showAll||name.startsWith(String(u8"🚀"))||name.startsWith("PocketFleet-")){names[count]=name;signal[count]=WiFi.RSSI(i);locked[count]=WiFi.encryptionType(i)!=WIFI_AUTH_OPEN;count++;}}
    if(!count&&!showAll){showAll=true;continue;}
    if(!count){screen.setTextColor(white,bg);screen.drawString("No Wi-Fi signals nearby",10,65,2);screen.drawString("Tap above to scan again",10,100,2);screen.fillRect(8,215,304,23,0x18C5);screen.setTextColor(aqua,0x18C5);screen.drawCentreString("SKIP WI-FI / PLAY SOLO",160,218,2);while(!touch.touched())delay(50);int y=touchY();waitTouchRelease();if(y>=215){offlineMode=true;return "";}continue;}
    for(int i=0;i<count;i++){int y=39+i*29;screen.fillRect(8,y,304,27,0x10C5);screen.setTextColor(white,0x10C5);screen.drawString(names[i].substring(0,19)+(locked[i]?" LOCK":" OPEN"),12,y+5,2);int bars=constrain((signal[i]+95)/10,0,4);for(int k=0;k<4;k++)screen.fillRect(273+k*8,y+20-k*4,5,4+k*4,k<bars?TFT_GREEN:0x3186);}
    screen.fillRect(8,215,304,23,0x18C5);screen.setTextColor(aqua,0x18C5);screen.drawCentreString("SKIP WI-FI / PLAY SOLO",160,218,2);
    while(!touch.touched())delay(30);int x=touchX(),y=touchY(),index=(y-39)/29;waitTouchRelease();if(y>=215){offlineMode=true;return "";}if(y<30&&x>170){showAll=!showAll;continue;}if(y<39||index<0||index>=count)continue;
    signalStrength=signal[index];selectedWifiPassword=locked[index]?(strlen(WIFI_PASSWORD)?String(WIFI_PASSWORD):inputText("WI-FI PASSWORD")):"";if(locked[index]&&!selectedWifiPassword.length())continue;selectedRocketWifi=names[index].startsWith(String(u8"🚀"))||names[index].startsWith("PocketFleet-");return names[index];
  }
}
bool connectToFleetWifi(){
  offlineMode=false;
  WiFi.mode(WIFI_STA);
  while(true){
    String network=chooseNetwork();if(offlineMode){WiFi.mode(WIFI_OFF);return false;}if(!network.length())continue;
    WiFi.begin(network.c_str(),selectedWifiPassword.length()?selectedWifiPassword.c_str():nullptr);
    unsigned long started=millis();while(WiFi.status()!=WL_CONNECTED&&millis()-started<18000)delay(300);
    if(WiFi.status()!=WL_CONNECTED){screen.fillScreen(bg);screen.setTextColor(TFT_RED,bg);screen.drawString("Cannot dock / check password",8,80,2);delay(1300);continue;}
    if(!fleetHost.length()){
      if(selectedRocketWifi)fleetHost=WiFi.gatewayIP().toString();
      else{fleetHost=inputText("FLEET HOST IP",false);if(!fleetHost.length()){WiFi.disconnect();WiFi.mode(WIFI_OFF);offlineMode=true;return false;}}
    }
    offlineMode=false;return true;
  }
}
bool refreshDocks(){
  HTTPClient http;http.begin(endpoint("docks")+"?limit=5");if(http.GET()!=200){http.end();compatibleHost=false;dockCount=0;return false;}DynamicJsonDocument doc(4096);bool okay=deserializeJson(doc,http.getStream())==DeserializationError::Ok;http.end();compatibleHost=okay&&doc["protocol"].as<int>()==2;if(!compatibleHost){dockCount=0;return false;}
  dockCount=0;for(JsonObject dock:doc["docks"].as<JsonArray>()){if(dockCount>=5)break;dockCodes[dockCount]=dock["code"].as<String>();dockShipIds[dockCount]=dock["shipId"].as<String>();dockNames[dockCount]=dock["ship"].as<String>();dockFleets[dockCount]=dock["fleet"].as<String>();dockFleetLocked[dockCount]=dock["fleetLocked"]|false;dockShipLocked[dockCount]=dock["shipLocked"]|false;dockCrew[dockCount]=dock["crew"]|0;dockCapacity[dockCount]=dock["capacity"]|8;dockCount++;}
  signalStrength=WiFi.RSSI();lastDockScan=millis();return true;
}
void requestDock(int index){
  if(index<0||index>=dockCount||dockCrew[index]>=dockCapacity[index])return;fleetCode=dockCodes[index];shipId=dockShipIds[index];fleetPinEntered=dockFleetLocked[index]?inputText("FLEET CODE",true):"";shipPinEntered=dockShipLocked[index]?inputText("SHIP CODE",true):"";boardBridge();
}
void handleRelay(){
  if(!hotspotActive)return;WiFiClient client=relay.available();if(!client)return;client.setTimeout(2000);String requestLine=client.readStringUntil('\n');requestLine.trim();if(!requestLine.length()){client.stop();return;}WiFiClient upstream;if(!upstream.connect(fleetHost.c_str(),FLEET_PORT)){client.stop();return;}upstream.setTimeout(2000);upstream.print(requestLine+"\r\n");int bodyLength=0;
  while(client.connected()){String line=client.readStringUntil('\n');line.trim();if(!line.length())break;String lower=line;lower.toLowerCase();if(lower.startsWith("content-length:"))bodyLength=line.substring(15).toInt();if(!lower.startsWith("connection:"))upstream.print(line+"\r\n");}
  upstream.print("Connection: close\r\n\r\n");unsigned long deadline=millis()+4000;while(bodyLength>0&&millis()<deadline){while(client.available()&&bodyLength>0){upstream.write((uint8_t)client.read());bodyLength--;deadline=millis()+4000;}delay(1);}
  deadline=millis()+5000;uint8_t buffer[256];while((upstream.connected()||upstream.available())&&millis()<deadline){int count=upstream.available();if(count>0){int n=upstream.read(buffer,min(count,256));if(n>0)client.write(buffer,n);deadline=millis()+5000;}else delay(1);}upstream.stop();client.stop();
}
void prepareShip(){
  String randomName=String(wifiWords[esp_random()%28]);String wanted=inputText("YOUR SHIP NAME",false,randomName);if(!wanted.length())wanted=randomName;
  String pin=inputText("FLEET CODE / OPTIONAL",true);if(pin.length()&&(pin.length()<4||pin.length()>8)){screen.fillScreen(bg);screen.drawString("Code must be 4-8 digits",8,85,2);delay(1300);return;}
  String apPassword=HOST_WIFI_PASSWORD;if(!apPassword.length())apPassword=inputText("ROCKET WI-FI PASS",false);if(apPassword.length()&&apPassword.length()<8){screen.fillScreen(bg);screen.drawString("Wi-Fi pass needs 8+",8,85,2);delay(1300);return;}
  DynamicJsonDocument doc(384);doc["name"]=wanted+" Fleet";doc["shipName"]=wanted;doc["pin"]=pin;String body;serializeJson(doc,body);HTTPClient http;http.begin(endpoint("create"));http.addHeader("Content-Type","application/json");if(http.POST(body)!=200){http.end();screen.drawString("Host unavailable",8,85,2);return;}StaticJsonDocument<256> response;bool okay=deserializeJson(response,http.getStream())==DeserializationError::Ok;http.end();if(!okay)return;
  fleetCode=response["code"].as<String>();shipId="ship-1";fleetPinEntered=pin;shipPinEntered="";hotspotName=String(u8"🚀")+wifiWords[esp_random()%28]+"-"+String(esp_random()%256,HEX);hotspotName.toLowerCase();
  WiFi.mode(WIFI_AP_STA);hotspotActive=WiFi.softAP(hotspotName.c_str(),apPassword.length()?apPassword.c_str():nullptr);if(hotspotActive)relay.begin();boardBridge();
}
void saveLook(){const char* names[]={"human","alien","android","feline","amphibian"};const char* faces[]={"round","long","square"};DynamicJsonDocument doc(2560);if(profileCache.length())deserializeJson(doc,profileCache);doc["id"]=profileId;doc["name"]=profileName;doc["xp"]=profileXp;doc["escapes"]=escapes;doc["soloMissions"]=soloMissions;doc["soloKills"]=soloKills;doc["look"]["species"]=names[portraitSpecies];doc["look"]["face"]=faces[portraitFace];if(doc["look"]["hue"].isNull())doc["look"]["hue"]=portraitHue;String saved;serializeJson(doc,saved);preferences.putString("profile",saved);profileCache=saved;profilePending="";lastProfileSave=millis();}
void setup() {
  Serial.begin(115200);for(int pin:{4,16,17}){digitalWrite(pin,HIGH);pinMode(pin,OUTPUT);}pinMode(0,INPUT_PULLUP);
  screen.init();screen.setRotation(1);
  ledcSetup(7,20000,8);ledcAttachPin(TFT_BL,7);ledcWrite(7,110);
  screen.fillScreen(bg);
#ifdef POCKET_FLEET_CYD35C
  screen.setViewport(80,40,320,240,true);
  touch.begin();
#else
  touchBus.begin(25,39,32,33);touch.begin(touchBus);touch.setRotation(1);
#endif
  screen.setTextColor(aqua,bg);screen.drawString("POCKET FLEET",9,20,2);WiFi.mode(WIFI_STA);
  profileId="cyd-"+WiFi.macAddress();profileId.replace(":","");WiFi.mode(WIFI_OFF);offlineMode=true;
  preferences.begin("pocketfleet",false);profileCache=preferences.getString("profile","");
  if(profileCache.length()){DynamicJsonDocument cached(2560);if(deserializeJson(cached,profileCache)==DeserializationError::Ok){profileName=cached["name"]|CREW_NAME;profileXp=cached["xp"]|0;rankLevel=1+(int)sqrtf(profileXp/100.0f);escapes=cached["escapes"]|0;survivors=cached["survivedExplosions"]|0;closeCalls=cached["closeCalls"]|0;soloMissions=cached["soloMissions"]|0;soloKills=cached["soloKills"]|0;portraitHue=cached["look"]["hue"]|190;portraitTone=cached["look"]["tone"]|28;String species=cached["look"]["species"]|"human";const char* names[]={"human","alien","android","feline","amphibian"};for(int i=0;i<5;i++)if(species==names[i])portraitSpecies=i;String face=cached["look"]["face"]|"round";const char* faces[]={"round","long","square"};for(int i=0;i<3;i++)if(face==faces[i])portraitFace=i;}}
  ready=true;quarters=true;dockPage=false;draw();lastCredit=millis();
}
void loop() {
  if(!ready){delay(200);return;}handleRelay();if(!offlineMode&&WiFi.status()!=WL_CONNECTED){WiFi.reconnect();delay(200);return;}
  if(!offlineMode&&quarters&&dockPage&&millis()-lastDockScan>6000){refreshDocks();draw();}
  if(!offlineMode&&aboard&&millis()-lastPoll>1700){if(fetchState())draw();lastPoll=millis();}
  if(!quarters&&millis()-lastDraw>350){updateActionTimers();lastDraw=millis();}
  updateShotAnimation();
  if(messageUntil&&millis()>=messageUntil){messageUntil=0;if(!quarters&&!forwardView&&station==5)draw();}
  if(hailUntil&&millis()>=hailUntil){hailUntil=0;if(!quarters&&(forwardView||station==0))drawForward(29,forwardView?188:86);}
  if(tapUntil&&millis()>=tapUntil){screen.drawRect(1,1,318,238,bg);tapUntil=0;}
  if(!offlineMode&&aboard&&!quarters&&millis()-lastCredit>30000){StaticJsonDocument<160> doc;doc["code"]=fleetCode;doc["playerId"]=profileId;doc["station"]=stations[station];doc["seconds"]=30;String body;serializeJson(doc,body);post("time",body);lastCredit=millis();}
  bool pressed=digitalRead(0)==LOW;if(pressed&&!buttonDown){buttonDown=true;buttonStarted=millis();}
  if(!pressed&&buttonDown){buttonDown=false;if(millis()-buttonStarted>=900){pendingShort=false;if(!quarters)leaveBridge(true);}else if(pendingShort&&millis()-shortAt<350){pendingShort=false;if(quarters){portraitSpecies=(portraitSpecies+1)%5;saveLook();}else{station=(station+1)%6;forwardView=false;}draw();}else{pendingShort=true;shortAt=millis();}}
  if(pendingShort&&millis()-shortAt>=350){pendingShort=false;if(quarters){dockPage=!dockPage;if(dockPage&&!offlineMode)refreshDocks();}else forwardView=!forwardView;draw();}
  if(touch.touched()&&millis()-lastTouch>300){int x=touchX(),y=touchY();lastTouch=millis();tapUntil=millis()+350;waitTouchRelease();
    if(choosingTarget){if(y<29&&x>170)choosingTarget=false;else if(y>=47&&y<223){int index=(y-47)/22;if(index<8){stationTargets[station]=index+1;choosingTarget=false;}}draw();return;}
    if(quarters){if(y<29&&x>170){dockPage=!dockPage;if(dockPage&&!offlineMode)refreshDocks();draw();}
      else if(dockPage&&y>=47&&y<187){int index=(y-47)/35;requestDock(index);}
      else if(dockPage&&y>=193&&y<228){if(offlineMode){if(connectToFleetWifi())refreshDocks();draw();}else prepareShip();}
      else if(dockPage&&y<45){if(!offlineMode)refreshDocks();draw();}
      else if(!dockPage&&y>=36&&y<150&&x<135){if(y<90)portraitSpecies=(portraitSpecies+1)%5;else portraitFace=(portraitFace+1)%3;saveLook();draw();}
      else if(!dockPage&&y>=194&&y<230)boardBridge();
    }else if(y>=232)leaveBridge(true);
    else if(forwardView){if(y<29&&x>170){forwardView=false;draw();}}
    else if(y<29&&x>170){station=(station+1)%6;draw();}
    else if(y<29&&station==1&&x<130){helmPage=(helmPage+1)%3;draw();}
    else if(station==1&&y>=29&&y<115){const char* direction=y<52?"Move up":y>91?"Move down":x<125?"Move left":x>193?"Move right":nullptr;if(direction)sendAction(direction);}
    else if(station==3&&y>=29&&y<115){int nx[]={160,160,260,160,60},ny[]={70,98,70,42,70};for(int i=0;i<5;i++)if(abs(x-nx[i])<16&&abs(y-ny[i])<16){selectedSystem=i;draw();break;}}
    else if(y>=118&&y<140&&x>185){if(station==3)selectedSystem=(selectedSystem+1)%5;else choosingTarget=true;draw();}
    else if(y>=144&&y<228){int index=(y-144)/21;if(index<4&&actionAt(station,index)[0]){tapUntil=millis()+350;sendAction(actionAt(station,index));}}
  }
}
