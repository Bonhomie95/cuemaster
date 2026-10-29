from PIL import Image, ImageDraw, ImageFont
import json,os,math,wave,struct,random
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf',36)
masks=[]
for n in range(16):
 im=Image.new('L',(48,48));d=ImageDraw.Draw(im);d.text((24,24),str(n),font=font,fill=255,anchor='mm');masks.append(list(im.getdata()))
json.dump(masks,open(root+'/mobile/assets/models/numbers.json','w'),separators=(',',':'))
# Sounds moved to tools/build_sounds.py.
