#include "../src/PinokioAnalyze.h"
#include <cstdio>
#include <cmath>
using namespace pinokio;
int fails=0;
void chk(bool c,const char*m){if(!c){printf("FAIL %s\n",m);fails++;}}

// draw an ellipse (head-ish) into an alpha buffer, optionally rolled
static std::vector<float> head(int W,int H,double cx,double cy,double rx,double ry,double roll=0){
  std::vector<float> a(size_t(W)*H,0.f);
  double c=cos(-roll),s=sin(-roll);
  for(int y=0;y<H;y++)for(int x=0;x<W;x++){
    double dx=x-cx,dy=y-cy; double u=dx*c-dy*s,v=dx*s+dy*c;
    if((u*u)/(rx*rx)+(v*v)/(ry*ry)<=1.0) a[size_t(y)*W+x]=1.f; }
  return a;
}
int main(){
  const int W=300,H=400;
  { auto a=head(W,H,150,200,80,100); AlphaMap m{a.data(),W,H};
    FaceGuess g=analyzeFace(m);
    printf("front: found=%d c=(%.1f,%.1f) r=%.1f yaw=%.2fd roll=%.2fd\n",
      g.found,g.centerX,g.centerY,g.radius,g.yaw*57.2958,g.roll*57.2958);
    chk(g.found,"front found");
    chk(fabs(g.centerX-150)<3,"front centerX");
    chk(fabs(g.centerY-200)<12,"front centerY at widest line");
    chk(fabs(g.radius-76)<6,"front radius ~0.95*rx");
    chk(fabs(g.yaw)<2*M_PI/180,"front yaw ~0");
    chk(fabs(g.roll)<2*M_PI/180,"front roll ~0"); }

  { auto a=head(W,H,150,200,80,100,12*M_PI/180); AlphaMap m{a.data(),W,H};
    FaceGuess g=analyzeFace(m);
    printf("tilted12: roll=%.2fd\n",g.roll*57.2958);
    chk(g.roll>3*M_PI/180,"tilt detected, right sign"); }

  { auto a=head(W,H,150,200,80,100,-12*M_PI/180); AlphaMap m{a.data(),W,H};
    FaceGuess g=analyzeFace(m);
    printf("tilted-12: roll=%.2fd\n",g.roll*57.2958);
    chk(g.roll<-3*M_PI/180,"tilt detected, other sign"); }

  { std::vector<float> a(size_t(W)*H,0.f); AlphaMap m{a.data(),W,H};
    chk(!analyzeFace(m).found,"empty rejected"); }

  { AlphaMap m{nullptr,0,0}; chk(!analyzeFace(m).found,"null rejected"); }

  { auto a=head(20,10,10,5,4,4); AlphaMap m{a.data(),20,10};
    chk(!analyzeFace(m).found,"too small rejected"); }

  // a head whose chin is swung to the right reads as already turned
  { std::vector<float> a(size_t(W)*H,0.f);
    for(int y=0;y<H;y++)for(int x=0;x<W;x++){
      double t=(y-100)/200.0; if(t<0||t>1) continue;
      double cx=150+40*t*t;                 // chin drifts right, skull does not
      double rx=80-40*t*t;
      double dx=x-cx; if(fabs(dx)<=rx) a[size_t(y)*W+x]=1.f; }
    AlphaMap m{a.data(),W,H}; FaceGuess g=analyzeFace(m);
    printf("chin-right: c=(%.1f,%.1f) yaw=%.2fd\n",g.centerX,g.centerY,g.yaw*57.2958);
    chk(g.found,"turned found"); chk(g.yaw>3*M_PI/180,"turn detected, right sign"); }

  printf(fails?"%d FAILURES\n":"all ok\n",fails); return fails!=0;
}
