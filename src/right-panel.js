import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import fontData from 'three/examples/fonts/helvetiker_regular.typeface.json' with { type: 'json' };

// Traced against the manufacturer's 400×400 right-side image. Pixel coordinates
// make the proportions, 24 channel stations and port positions reviewable.
// The returned group uses u=depth/up, v=product length, +Z=outward normal.
const P = (x, y) => new THREE.Vector2((206-y)/75, (x-200)/94);
const font = new FontLoader().parse(fontData);
function outerPixels() {
  const s=new THREE.Shape();
  s.moveTo(49,211);
  s.bezierCurveTo(48,195,65,176,85,168);
  s.bezierCurveTo(104,160,128,159,160,160);
  s.lineTo(317,161);
  s.bezierCurveTo(337,162,348,173,352,190);
  s.bezierCurveTo(357,210,350,225,333,232);
  s.bezierCurveTo(283,238,206,242,125,244);
  s.bezierCurveTo(87,244,61,237,52,222);
  s.quadraticCurveTo(49,217,49,211);
  return s;
}
const toShape = points => new THREE.Shape(points.map(p => P(p.x,p.y)));
const toHole = points => new THREE.Path(points.map(p => P(p.x,p.y)).reverse());
export function rightGrilleOutline() { return toShape(outerPixels().getPoints(14)); }
function roundedPixels(w,h,r,x,y) {
  const s=new THREE.Shape(),l=x-w/2,t=y-h/2;
  s.moveTo(l+r,t);s.lineTo(l+w-r,t);s.quadraticCurveTo(l+w,t,l+w,t+r);
  s.lineTo(l+w,t+h-r);s.quadraticCurveTo(l+w,t+h,l+w-r,t+h);
  s.lineTo(l+r,t+h);s.quadraticCurveTo(l,t+h,l,t+h-r);
  s.lineTo(l,t+r);s.quadraticCurveTo(l,t,l+r,t);return s;
}
function area(points){let a=0;for(let i=0;i<points.length;i++){const p=points[i],q=points[(i+1)%points.length];a+=p.x*q.y-q.x*p.y;}return a/2;}
function clip(subject,boundary){
  let output=subject;const direction=Math.sign(area(boundary));
  for(let i=0;i<boundary.length;i++){
    const a=boundary[i],b=boundary[(i+1)%boundary.length],input=output;output=[];
    if(input.length<3)break;
    const side=p=>direction*((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x));
    for(let j=0;j<input.length;j++){
      const p=input[j],q=input[(j+1)%input.length],dp=side(p),dq=side(q);
      if(dp>=-1e-7)output.push(p);
      if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq);output.push(new THREE.Vector2(p.x+(q.x-p.x)*t,p.y+(q.y-p.y)*t));}
    }
  }
  return output.filter((p,i,list)=>i===0||p.distanceToSquared(list[i-1])>1e-8);
}
function shapeGeometry(shape,depth,bevel=.003){return new THREE.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:2,curveSegments:8});}
function servicePixels(){
  const s=new THREE.Shape();s.moveTo(155,187);
  s.bezierCurveTo(156,172,164,166,178,166);s.lineTo(296,166);
  s.bezierCurveTo(312,167,322,177,322,190);
  s.bezierCurveTo(322,204,312,213,298,214);s.lineTo(174,215);
  s.bezierCurveTo(160,215,153,204,155,187);return s;
}
function circlePixels(x,y,r){const s=new THREE.Shape();s.absarc(x,y,r,0,Math.PI*2,false);return s.getPoints(40);}

export function createRightPanel(materials) {
  const group=new THREE.Group();group.name='Reference-traced right side grille and service ports';
  group.userData.channelCount=24;
  const { voidMat, brass, nickel, edgeMat }=materials;
  const face=new THREE.MeshStandardMaterial({name:'Molded grille graphite',color:'#292b2c',roughness:.62});
  const plateMat=new THREE.MeshStandardMaterial({name:'Recessed service plate',color:'#252728',roughness:.66});
  const grooveMat=new THREE.MeshStandardMaterial({name:'Closed ventilation grooves',color:'#292b2c',roughness:.65});
  const scoopMat=new THREE.MeshStandardMaterial({name:'Concave card access scoops',color:'#353738',roughness:.42});
  function add(geometry,material,z,name){
    // Clipped boundary tips can collapse into zero-area triangles. Remove those
    // and compact indexed meshes so unused scoop-end normals are not exported.
    const p=geometry.attributes.position,index=geometry.index,count=index?index.count:p.count;
    const kept=[],a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
    for(let i=0;i<count;i+=3){
      const ai=index?index.getX(i):i,bi=index?index.getX(i+1):i+1,ci=index?index.getX(i+2):i+2;
      a.fromBufferAttribute(p,ai);b.fromBufferAttribute(p,bi);c.fromBufferAttribute(p,ci);
      if(b.sub(a).cross(c.sub(a)).lengthSq()>1e-18)kept.push(ai,bi,ci);
    }
    if(index||kept.length!==count){geometry.setIndex(kept);const compact=geometry.toNonIndexed();geometry.dispose();geometry=compact;}
    const m=new THREE.Mesh(geometry,material);m.position.z=z;m.name=name;m.castShadow=true;m.receiveShadow=true;group.add(m);return m;}
  const boundary=outerPixels().getPoints(20);
  const inner=boundary.map(p=>new THREE.Vector2(200+(p.x-200)*.956,202+(p.y-202)*.878));
  const grille=rightGrilleOutline();
  const slotFloors=[];
  const closedStations=new Set([8,9,13,14,15,18,19]);
  function channel(i,from,to,open=true,clipRegion=null){
    const width=6.35;
    const points=roundedPixels(width,to-from,1.0,61+12*i,(from+to)/2).getPoints(4)
      .map(p=>new THREE.Vector2(p.x+.44*(p.y-200),p.y));
    let polygon=clip(points,inner);
    if(clipRegion)polygon=clip(polygon,clipRegion);
    if(polygon.length<3||Math.abs(area(polygon))<3)return;
    grille.holes.push(toHole(polygon));
    if(!open)slotFloors.push(toShape(polygon));
  }
  // Nose bank: same diagonal channel repeated, interrupted by two molded ribs.
  for(let i=0;i<8;i++){
    const first=198-i,second=225-i;
    if(i!==5)channel(i,164,first-1.5,i<4);
    else channel(i,181,first-1.5,false); // round reset bore occupies the channel head
    channel(i,first+1.5,second-1.5,true);
    channel(i,second+1.5,244,true);
  }
  // Short closed grooves before the plate's rounded leading corner.
  channel(8,164,181,false);channel(9,164,170,false);
  // Alternating open/closed groups along the bottom of the service cover.
  for(let i=8;i<22;i++)channel(i,218,244,!closedStations.has(i));
  const beyondCover=[new THREE.Vector2(326,158),new THREE.Vector2(359,158),new THREE.Vector2(359,246),new THREE.Vector2(326,246)];
  channel(22,165,196,true,beyondCover);channel(22,200,243,true,beyondCover);
  channel(23,166,199,true);channel(23,203,241,true);
  // Cut the entire plate recess out of the grille so the card mouths are open.
  const service=servicePixels();grille.holes.push(toHole(service.getPoints(14)));
  grille.holes.push(toHole(circlePixels(111,172,3.5)));
  add(shapeGeometry(rightGrilleOutline(),.007,.002),voidMat,-.066,'Deep interior behind open cooling channels');
  add(shapeGeometry(grille,.026,.0045),face,.010,'Beveled cooling grille with split diagonal slots');
  for(const shape of slotFloors)add(new THREE.ShapeGeometry(shape,4),grooveMat,.029,'Shallow closed channel floor');
  // A narrow edge is molded into the shell around the inset vent field.
  const frame=rightGrilleOutline();
  frame.holes.push(toHole(boundary.map(p=>new THREE.Vector2(200+(p.x-200)*.985,202+(p.y-202)*.965))));
  add(shapeGeometry(frame,.012,.0025),face,.032,'Thin continuous grille perimeter rim');

  const plate=toShape(service.getPoints(16));
  const mouthCenters=[200,266];
  for(const cx of mouthCenters){
    const port=new THREE.Shape();port.moveTo(cx-21,171.5);port.lineTo(cx+21,171.5);port.lineTo(cx+21,179.2);
    port.bezierCurveTo(cx+14,189.5,cx-12,190,cx-21,179.2);port.closePath();
    plate.holes.push(toHole(port.getPoints(12)));
  }
  // Four keyed apertures, placed separately from the two card slots.
  for(const [x,y,w,h] of [[165,192.5,7,11],[232.5,175.5,8,9],[209,207,9,10],[269,207,9,10]])
    plate.holes.push(toHole(roundedPixels(w,h,.45,x,y).getPoints(3)));
  for(const x of [177,293])plate.holes.push(toHole(circlePixels(x,193,5.4)));
  add(shapeGeometry(toShape(service.getPoints(16)),.008,.003),voidMat,-.056,'Recess behind service panel and card connectors');
  add(shapeGeometry(plate,.013,.003),plateMat,.022,'Service cover with two card mouths and four keyed apertures');
  // Concave half-ellipsoids form the fingertip scoops beneath the black mouths.
  for(const cx of mouthCenters){
    const positions=[],indices=[],segments=32,rows=8;
    for(let row=0;row<=rows;row++){
      const t=row/rows;
      for(let i=0;i<=segments;i++){
        const q=-1+2*i/segments;
        const px=cx+21*q,py=179.2+8.0*Math.sqrt(Math.max(0,1-q*q))*t;
        const uv=P(px,py);
        const z=.037-.068*(1-t*t)*Math.sqrt(Math.max(0,1-q*q));
        positions.push(uv.x,uv.y,z);
      }
    }
    for(let row=0;row<rows;row++)for(let i=0;i<segments;i++){
      const a=row*(segments+1)+i,b=a+1,c=a+segments+1,d=c+1;
      if(i<segments-1)indices.push(a,b,d);
      if(i>0)indices.push(a,d,c);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    add(geometry,scoopMat,0,'Sculpted fingertip recess beneath card mouth');
    // Thin connector lip inside the upper dark aperture.
    const lip=toShape(roundedPixels(37,1.0,.3,cx,175.6).getPoints(3));
    add(new THREE.ShapeGeometry(lip),nickel,-.002,'Recessed connector contact edge');
  }
  for(const x of [177,293]){
    const bezel=toShape(circlePixels(x,193,5.1));bezel.holes.push(toHole(circlePixels(x,193,3.0)));
    add(shapeGeometry(bezel,.006,.001),nickel,.035,'Thin metal screw rim');
    const screw=toShape(circlePixels(x,193,4.4));screw.holes.push(toHole(circlePixels(x,193,2.15)));
    add(shapeGeometry(screw,.008,.0015),brass,.040,'Brass annular fastener');
    add(new THREE.ShapeGeometry(toShape(circlePixels(x,193,2.15))),voidMat,.038,'Recessed dark screw bore');
    const slot=toShape(roundedPixels(1.0,3.0,.15,x,193).getPoints(2));add(new THREE.ShapeGeometry(slot),brass,.042,'Interior screw drive edge');
  }
  // Low-contrast molded legends are upside-down in the original side view.
  function label(text,cx,cy,size){
    const geometry=new THREE.ShapeGeometry(font.generateShapes(text,size),3);geometry.computeBoundingBox();
    const center=geometry.boundingBox.getCenter(new THREE.Vector3()),position=geometry.attributes.position;
    for(let i=0;i<position.count;i++){
      const px=cx-(position.getX(i)-center.x),py=cy+(position.getY(i)-center.y),uv=P(px,py);
      position.setXYZ(i,uv.x,uv.y,0);
    }
    geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
    add(geometry,new THREE.MeshStandardMaterial({name:'Stamped port legend',color:'#46494a',roughness:.85,side:THREE.DoubleSide}),.039,`Molded ${text} legend`);
  }
  label('TF/FLASH',210,195.5,4.7);label('SIM',270,195.5,4.7);
  return group;
}
