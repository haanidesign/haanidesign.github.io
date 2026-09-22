#include "../src/PinokioWarp.h"
#include <cstdio>
using namespace pinokio;
static const double D2R = 3.14159265358979323846/180.0;
int fails=0;
void chk(bool c, const char* m){ if(!c){ printf("FAIL %s\n", m); fails++; } }
int main(){
  HeadRig r; r.centerX=100; r.centerY=100; r.radius=50;
  { WarpState s(r); Vec2 p=s.sourceOf(123,77); chk(p.x==123&&p.y==77,"neutral identity"); }
  // pose equals original pose -> identity
  r.yaw=10*D2R; r.origYaw=10*D2R;
  { WarpState s(r); Vec2 p=s.sourceOf(123,77); chk(p.x==123&&p.y==77,"pose==orig identity"); }
  // yaw right: centre pixel should sample from the left of the source
  r.origYaw=0; r.yaw=15*D2R;
  { WarpState s(r); Vec2 p=s.sourceOf(100,100);
    printf("yaw15 centre -> %.3f %.3f\n",p.x,p.y);
    chk(p.x<100,"yaw moves sampling"); chk(fabs(p.y-100)<1e-9,"yaw keeps y"); }
  // far outside the head is untouched when there is no roll
  { WarpState s(r); Vec2 p=s.sourceOf(100+50*3,100);
    chk(fabs(p.x-250)<1e-9&&fabs(p.y-100)<1e-9,"outside falloff untouched"); }
  // continuity across the silhouette
  { WarpState s(r);
    Vec2 a=s.sourceOf(100+50*0.999,100), b=s.sourceOf(100+50*1.001,100);
    chk(fabs(a.x-b.x)<0.5,"continuous at silhouette"); }
  // continuity at the outer edge of the falloff
  { WarpState s(r); double R=50*(1.0+r.falloff);
    Vec2 a=s.sourceOf(100+R*0.999,100), b=s.sourceOf(100+R*1.001,100);
    chk(fabs(a.x-b.x)<0.5&&fabs(a.y-b.y)<0.5,"continuous at falloff edge"); }
  // roll only: pure 2D rotation everywhere
  { HeadRig q=r; q.yaw=0; q.roll=90*D2R; WarpState s(q);
    Vec2 p=s.sourceOf(150,100); printf("roll90 (150,100) -> %.3f %.3f\n",p.x,p.y);
    chk(fabs(p.x-100)<1e-6&&fabs(p.y-50)<1e-6,"roll 90 maps right->up"); }
  // strength 0 is identity
  { HeadRig q=r; q.strength=0; WarpState s(q); Vec2 p=s.sourceOf(110,90);
    chk(p.x==110&&p.y==90,"strength 0"); }
  // strength scales
  { HeadRig q=r; WarpState f(q); q.strength=0.5; WarpState h(q);
    double df=f.sourceOf(100,100).x-100, dh=h.sourceOf(100,100).x-100;
    chk(fabs(dh-df*0.5)<1e-9,"strength scales"); }
  // pitch down moves sampling up
  { HeadRig q=r; q.yaw=0; q.pitch=10*D2R; WarpState s(q); Vec2 p=s.sourceOf(100,100);
    printf("pitch10 centre -> %.3f %.3f\n",p.x,p.y);
    chk(fabs(p.x-100)<1e-9,"pitch keeps x"); chk(p.y!=100,"pitch moves y"); }
  // max displacement is finite and sane
  { HeadRig q=r; q.yaw=20*D2R; double m=maxDisplacement(q);
    printf("maxDisp yaw20 r=50 -> %.3f px\n",m);
    chk(m>0&&m<50,"maxDisplacement sane"); }
  printf(fails? "%d FAILURES\n":"all ok\n", fails);
  return fails!=0;
}
