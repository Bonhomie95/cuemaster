from PIL import Image, ImageDraw, ImageFont
import json,os,math,wave,struct,random
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf',36)
masks=[]
for n in range(16):
 im=Image.new('L',(48,48));d=ImageDraw.Draw(im);d.text((24,24),str(n),font=font,fill=255,anchor='mm');masks.append(list(im.getdata()))
json.dump(masks,open(root+'/mobile/assets/models/numbers.json','w'),separators=(',',':'))
os.makedirs(root+'/mobile/assets/audio',exist_ok=True)
for name,freq,duration in [('ball',2100,.065),('rail',190,.1),('cue',850,.06),('pocket',120,.18)]:
 rng=random.Random(3);rate=44100
 with wave.open(root+'/mobile/assets/audio/'+name+'.wav','wb')as w:
  w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate)
  for i in range(int(rate*duration)):
   t=i/rate;en=math.exp(-t/(duration/5));a=(math.sin(2*math.pi*freq*t)+.35*math.sin(2*math.pi*freq*2.31*t))*.42*en+rng.uniform(-1,1)*.13*math.exp(-t/.003)
   w.writeframesraw(struct.pack('<h',int(max(-1,min(1,a))*21000)))
