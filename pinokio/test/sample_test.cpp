// Stubs matching the After Effects pixel structs and the few effect-world
// fields Pinokio touches, so the real sampling code can be exercised here.
#include <cstdint>
typedef unsigned char  A_u_char;
typedef unsigned short A_u_short;
struct PF_Pixel8     { A_u_char  alpha, red, green, blue; };
struct PF_Pixel16    { A_u_short alpha, red, green, blue; };
struct PF_PixelFloat { float     alpha, red, green, blue; };
struct FakeWorld { void* data; long rowbytes; int width, height, origin_x, origin_y; };

#include "../src/PinokioSample.h"
#include <cstdio>
#include <vector>
using namespace pinokio;
int fails=0; void chk(bool c,const char*m){if(!c){printf("FAIL %s\n",m);fails++;}}

static std::vector<PF_Pixel8> buf;
static FakeWorld make(int w,int h,int ox,int oy){
  buf.assign(size_t(w)*h, PF_Pixel8{0,0,0,0});
  FakeWorld f{buf.data(), long(w*sizeof(PF_Pixel8)), w,h,ox,oy}; return f; }

int main(){
  const int W=64,H=64;
  FakeWorld src=make(W,H,0,0);
  for(int y=0;y<H;y++)for(int x=0;x<W;x++){
    PF_Pixel8&p=RowOf<PF_Pixel8,FakeWorld>(src,y)[x];
    p.alpha=255; p.red=A_u_char(x*4); p.green=A_u_char(y*4); p.blue=7; }

  HeadRig rig; rig.centerX=32; rig.centerY=32; rig.radius=20;

  // an untouched rig must copy, pixel for pixel
  { WarpState st(rig); std::vector<PF_Pixel8> out(size_t(W)*H);
    FakeWorld dst{out.data(), long(W*sizeof(PF_Pixel8)), W,H,0,0};
    bool same=true;
    for(int y=0;y<H;y++)for(int x=0;x<W;x++){
      PF_Pixel8 o; WarpOnePixel<PF_Pixel8,FakeWorld>(st,src,dst,x,y,o);
      const PF_Pixel8& s=RowOf<PF_Pixel8,FakeWorld>(src,y)[x];
      if(o.red!=s.red||o.green!=s.green||o.blue!=s.blue||o.alpha!=s.alpha) same=false; }
    chk(same,"identity rig is an exact copy"); }

  // the same, with the output buffer grown by 8 px on every side
  { WarpState st(rig); const int PW=W+16,PH=H+16;
    std::vector<PF_Pixel8> out(size_t(PW)*PH);
    FakeWorld dst{out.data(), long(PW*sizeof(PF_Pixel8)), PW,PH,8,8};
    bool same=true;
    for(int y=0;y<H;y++)for(int x=0;x<W;x++){
      PF_Pixel8 o; WarpOnePixel<PF_Pixel8,FakeWorld>(st,src,dst,x+8,y+8,o);
      const PF_Pixel8& s=RowOf<PF_Pixel8,FakeWorld>(src,y)[x];
      if(o.red!=s.red||o.green!=s.green) same=false; }
    chk(same,"expanded buffer stays aligned");
    PF_Pixel8 o; WarpOnePixel<PF_Pixel8,FakeWorld>(st,src,dst,0,0,o);
    chk(o.alpha==0,"padding is transparent"); }

  // outside the source reads transparent black, never a smeared edge
  { PF_Pixel8 o; SampleBilinear<PF_Pixel8,FakeWorld>(src,-50,-50,o);
    chk(o.alpha==0&&o.red==0,"far outside is empty");
    SampleBilinear<PF_Pixel8,FakeWorld>(src,W+3,10,o);
    chk(o.alpha==0,"past the right edge is empty"); }

  // half-way between two texels is their average
  { PF_Pixel8 o; SampleBilinear<PF_Pixel8,FakeWorld>(src,10.5,20.0,o);
    chk(o.red==A_u_char((10*4+11*4)/2),"bilinear averages"); }

  // a yawed rig actually moves content, and keeps it opaque in the middle
  { HeadRig q=rig; q.yaw=15*3.14159265358979/180; WarpState st(q);
    FakeWorld dst{nullptr,0,W,H,0,0};
    PF_Pixel8 a,b;
    WarpOnePixel<PF_Pixel8,FakeWorld>(st,src,dst,32,32,a);
    WarpState id(rig);
    WarpOnePixel<PF_Pixel8,FakeWorld>(id,src,dst,32,32,b);
    printf("yaw centre red %d vs %d\n",a.red,b.red);
    chk(a.red!=b.red,"yaw moves content"); chk(a.alpha==255,"yaw stays opaque"); }

  // 32 bpc values above 1.0 survive
  { std::vector<PF_PixelFloat> f(4,{2.5f,3.5f,4.5f,5.5f});
    FakeWorld fw{f.data(), long(2*sizeof(PF_PixelFloat)),2,2,0,0};
    PF_PixelFloat o; SampleBilinear<PF_PixelFloat,FakeWorld>(fw,0.5,0.5,o);
    chk(o.red>3.4f,"float is not clamped"); }

  printf(fails?"%d FAILURES\n":"all ok\n",fails); return fails!=0;
}
