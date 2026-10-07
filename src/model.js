import * as THREE from 'three';
import { createRightPanel, rightGrilleOutline } from './right-panel.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toCreasedNormals, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';

// Reconstructed from the supplied front/right, rear/left and locked-cover views.
// Local axes: X across the product, Y toward the cable, Z toward the mounting face.
export function createCameraModel() {
  const root = new THREE.Group();
  root.name = 'Image reference — connected camera';
  const mat = (name, color, roughness = .46, metalness = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    m.name = name;
    return m;
  };
  const housing = mat('Charcoal molded ABS', '#222323', .58);
  const panelMat = mat('Inset graphite panels', '#202122', .60);
  const edgeMat = mat('Seams and black fasteners', '#101112', .44);
  const voidMat = mat('Unlit cavity interiors', '#030405', .95);
  const rubber = mat('Cable and soft touch cover', '#191a1b', .66);
  const lensMetal = mat('Anodized lens barrel', '#121618', .25, .45);
  const brass = mat('Brass inserts', '#b2995a', .29, .79);
  const nickel = mat('Mount insert edge', '#b2b4a5', .28, .83);
  const evaluator = new Evaluator();
  evaluator.useGroups = false;
  function add(geometry, material, position = [0, 0, 0], parent = root, name = '') {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...position);
    object.castShadow = true;
    object.receiveShadow = true;
    object.name = name;
    parent.add(object);
    return object;
  }
  const roundBox = (w,h,d,r) => new RoundedBoxGeometry(w,h,d,5,r);
  const box = (w,h,d,r,m,p,parent=root,name='') => add(roundBox(w,h,d,r),m,p,parent,name);
  function disk(r,depth,m,p,parent=root) {
    const geometry = new THREE.CylinderGeometry(r,r,depth,64);
    geometry.rotateX(Math.PI/2);
    return add(geometry,m,p,parent);
  }
  function ring(r,tube,m,p,parent=root) {
    return add(new THREE.TorusGeometry(r,tube,12,80),m,p,parent);
  }
  function roundedShape(w,h,r,x=0,y=0) {
    const s=new THREE.Shape(); const l=x-w/2, b=y-h/2;
    s.moveTo(l+r,b);s.lineTo(l+w-r,b);s.quadraticCurveTo(l+w,b,l+w,b+r);
    s.lineTo(l+w,b+h-r);s.quadraticCurveTo(l+w,b+h,l+w-r,b+h);
    s.lineTo(l+r,b+h);s.quadraticCurveTo(l,b+h,l,b+h-r);
    s.lineTo(l,b+r);s.quadraticCurveTo(l,b,l+r,b);
    return s;
  }
  function shapeHole(shape) {
    return new THREE.Path(shape.getPoints(4).reverse());
  }
  function extrude(shape, depth, bevel=.008) {
    return new THREE.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:2,curveSegments:12});
  }
  function subtract(geometry, cutterGeometry, p=[0,0,0]) {
    const a=new Brush(geometry,housing), b=new Brush(cutterGeometry,housing);
    b.position.set(...p);a.updateMatrixWorld();b.updateMatrixWorld();
    const result=evaluator.evaluate(a,b,SUBTRACTION);
    // Strip acceleration structures so the returned mesh is a portable Three.js asset.
    const g=result.geometry.clone();g.clearGroups();
    a.disposeCacheData();b.disposeCacheData();
    return g;
  }
  // Side profile supplies the actual curved nose, broad shoulder and tapered tail.
  // Extruding this profile across the width avoids the flat telephone shape of v1.
  const profile=new THREE.Shape();
  profile.moveTo(-1.70,-.46);
  profile.bezierCurveTo(-1.88,-.37,-1.91,-.10,-1.78,.12);
  profile.bezierCurveTo(-1.58,.47,-1.25,.61,-.70,.63);
  profile.lineTo(1.22,.63);
  profile.bezierCurveTo(1.57,.63,1.73,.48,1.74,.22);
  profile.bezierCurveTo(1.75,-.04,1.60,-.27,1.29,-.36);
  profile.bezierCurveTo(.60,-.45,.08,-.47,-.12,-.53);
  profile.bezierCurveTo(-.43,-.65,-.72,-1.07,-1.04,-1.05);
  profile.bezierCurveTo(-1.32,-1.00,-1.65,-.65,-1.70,-.46);
  profile.closePath();
  const bodyGeometry=new THREE.ExtrudeGeometry(profile,{depth:1.90,bevelEnabled:true,bevelSize:.13,bevelThickness:.20,bevelSegments:9,curveSegments:40});
  bodyGeometry.translate(0,0,-.95);
  // (profile u, profile v, extrusion w) -> (w, u, v).
  bodyGeometry.applyMatrix4(new THREE.Matrix4().set(0,0,1,0, 1,0,0,0, 0,1,0,0, 0,0,0,1));
  let body = toCreasedNormals(bodyGeometry, Math.PI/2.8);
  // This is a deep rounded pocket, not a black rectangle placed on the front.
  body=subtract(body,roundBox(1.12,1.95,2.2,.10),[0,-1.405,.67]);
  // Side recesses. Both panels lie in the actual cap of the enclosure.
  for(const sign of [-1,1]) {
    const pocket=extrude(sign===1 ? rightGrilleOutline() : grilleShape(),.40,.010);
    pocket.applyMatrix4(new THREE.Matrix4().set(0,0,sign,0, 0,1,0,0, 1,0,0,0, 0,0,0,1));
    if(sign===1) {
      for(const attribute of Object.values(pocket.attributes)) {
        const arr=attribute.array, size=attribute.itemSize;
        for(let i=0;i<attribute.count;i+=3) for(let c=0;c<size;c++) {
          const a=(i+1)*size+c,b=(i+2)*size+c,tmp=arr[a];arr[a]=arr[b];arr[b]=tmp;
        }
      }
    }
    body=subtract(body,pocket,[sign*(sign===1?1.015:1.056),0,-.01]);
  }
  // Countersunk holes on the shoulders of the optical cradle.
  for(const sign of [-1,1]) {
    const bore=new THREE.CylinderGeometry(.078,.078,.55,32);bore.rotateX(Math.PI/2+.88);
    body=subtract(body,bore,[sign*.80,-1.62,.33]);
  }
  // Boolean interpolation must not spread bevel normals across a planar side cap.
  if(body.index)body=body.toNonIndexed();
  const bp=body.attributes.position,bn=body.attributes.normal;
  const va=new THREE.Vector3(),vb=new THREE.Vector3(),vc=new THREE.Vector3(),normal=new THREE.Vector3();
  for(let i=0;i<bp.count;i+=3){
    va.fromBufferAttribute(bp,i);vb.fromBufferAttribute(bp,i+1);vc.fromBufferAttribute(bp,i+2);
    normal.crossVectors(vb.sub(va),vc.sub(va)).normalize();
    if(Math.abs(normal.x)>.9999)for(let j=0;j<3;j++)bn.setXYZ(i+j,Math.sign(normal.x),0,0);
  }
  add(body,housing,[0,0,0],root,'Curved enclosure with recessed optical cradle');
  box(1.035,1.35,.035,.10,voidMat,[0,-1.12,-.434],root,'Optical recess floor');

  // Side grille outline in panel coordinates (u = housing depth, v = length).
  function grilleShape() {
    const s=new THREE.Shape();
    s.moveTo(-.18,-1.54);
    s.bezierCurveTo(-.48,-1.42,-.50,-1.07,-.47,-.66);
    s.lineTo(-.30,1.14);
    s.bezierCurveTo(-.27,1.44,-.11,1.54,.12,1.47);
    s.bezierCurveTo(.40,1.40,.44,1.14,.42,.84);
    s.lineTo(.32,-.92);
    s.bezierCurveTo(.30,-1.27,.12,-1.54,-.18,-1.54);
    return s;
  }
  for(const sign of [-1,1]) {
    if(sign===1){
      const panel=createRightPanel({voidMat,brass,nickel,edgeMat});
      panel.position.set(1.095,0,-.01);panel.rotation.y=Math.PI/2;panel.scale.x=-1;
      root.add(panel);continue;
    }
    const panel=new THREE.Group();panel.name=sign===1?'Right ventilated port panel':'Left covered access panel';
    // Panel +u maps to +Z on the right, so both sides follow the same profile.
    panel.position.set(sign*1.095,0,-.01);
    panel.rotation.y=sign*Math.PI/2;
    panel.scale.x=sign===1?-1:1;
    // Reflections on a negative scale are corrected by three.js automatically.
    root.add(panel);
    const boundary=grilleShape();
    const backing=extrude(boundary,.012,.006);
    add(backing,voidMat,[0,0,-.019],panel,'Dark space behind the cooling slots');
    const grille=grilleShape();
    for(let row=0;row<23;row++) {
      const y=-1.36+row*.124;
      const center=-.07+.065*y;
      let width=y<-.85 ? .64*Math.sqrt(Math.max(.1,1-((y+.65)/.86)**2)) : .64;
      if(y>1.1)width=.55*Math.sqrt(Math.max(.08,1-((y-1.02)/.51)**2));
      // Two sets of openings leave a continuous service cover in the upper half.
      if(y>-.30 && y<1.14) {
        for(const side of [-1,1]) {
          const cx=center+side*width*.40;
          grille.holes.push(shapeHole(roundedShape(width*.20,.055,.01,cx,y)));
        }
      } else {
        const split=1;
        for(let i=0;i<split;i++) {
          const gap=.031;const slot=(width-gap*(split-1))/split;
          const cx=center-width/2+slot/2+i*(slot+gap);
          grille.holes.push(new THREE.Path(roundedShape(slot,.061,.012,cx,y).getPoints(4).reverse().map(p=>new THREE.Vector2(p.x,p.y+.36*p.x))));
        }
      }
    }
    const skin=extrude(grille,.030,.004);
    add(skin,panelMat,[0,0,.008],panel,'Recessed molded grille with open slots');
    // Thin outer seam that follows the actual capsule, not the bounding rectangle.
    const points=boundary.getPoints(100).map(p=>new THREE.Vector3(p.x,p.y,.049));
    points.push(points[0].clone());
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,false),240,.008,6,false),edgeMat,[0,0,0],panel,'Panel perimeter seam');
      const service=box(.37,1.67,.035,.17,rubber,[-.04,.40,.066],panel,'Ribbed sealed access cover');
      for(let i=0;i<19;i++)box(.286,.013,.008,.004,panelMat,[-.04,-.31+i*.073,.088],panel);
      disk(.052,.012,edgeMat,[-.04,.98,.091],panel);
      disk(.025,.013,voidMat,[-.04,.98,.100],panel);
  }

  // Pivot lens block follows the downhill nose; the optical axis follows the curved nose.
  const optic=new THREE.Group();optic.name='Angled forward optical module';optic.position.set(0,-1.17,.125);optic.rotation.x=.88;root.add(optic);
  box(.95,.96,.48,.072,edgeMat,[0,0,-.035],optic,'Lens pivot block');
  box(.83,.85,.045,.035,panelMat,[0,0,.222],optic,'Square lens face');
  for(let i=0;i<7;i++)box(.82,.012,.19,.003,rubber,[0,.33+i*.012,-.05],optic);
  disk(.354,.035,edgeMat,[0,0,.258],optic);
  ring(.314,.028,lensMetal,[0,0,.281],optic);
  disk(.290,.028,voidMat,[0,0,.291],optic);
  ring(.267,.012,mat('Blue optical coating','#294a5a',.16,.6),[0,0,.312],optic);
  ring(.234,.009,lensMetal,[0,0,.319],optic);
  const opticalGlass=new THREE.MeshPhysicalMaterial({name:'Coated aspherical optical glass',color:'#233645',metalness:.53,roughness:.10,clearcoat:1,clearcoatRoughness:.06,iridescence:.7,iridescenceIOR:1.35,iridescenceThicknessRange:[230,420]});
  const glassProfile=[new THREE.Vector2(0,.037),new THREE.Vector2(.055,.036),new THREE.Vector2(.12,.028),new THREE.Vector2(.18,.010),new THREE.Vector2(.224,-.01)];
  const glassGeo=new THREE.LatheGeometry(glassProfile,80);glassGeo.rotateX(Math.PI/2);
  add(glassGeo,opticalGlass,[0,0,.341],optic,'Convex multi-coated glass');
  disk(.158,.011,mat('Purple interior coating','#382143',.20,.62),[0,0,.357],optic);
  ring(.136,.011,lensMetal,[0,0,.368],optic);
  disk(.106,.013,voidMat,[0,0,.371],optic);
  // Small central lens, with a real curved surface instead of a painted white dot.
  const inner=new THREE.SphereGeometry(.08,48,24);const innerLens=add(inner,opticalGlass,[0,0,.38],optic);innerLens.scale.z=.23;
  for(const sign of [-1,1]) {
    const screw=new THREE.Group();screw.position.set(sign*.80,-1.665,.32);screw.rotation.x=.88;root.add(screw);
    disk(.043,.012,lensMetal,[0,0,0],screw);box(.038,.008,.006,.001,voidMat,[0,0,.008],screw);
  }
  const lowerCradle=box(1.12,.12,.18,.024,housing,[0,-1.72,-.20],root,'Lower optical cradle bridge');lowerCradle.rotation.x=.88;
  // Upper windshield mounting block: inset rim, three keyed slots, recessed thread.
  const mountGroup=new THREE.Group();mountGroup.name='Original mounting plate';mountGroup.position.set(0,.78,.69);root.add(mountGroup);
  box(1.89,1.31,.045,.05,edgeMat,[0,0,-.025],mountGroup,'Mount base gasket');
  const mountShape=roundedShape(1.86,1.29,.055);
  for(const [x,y,w,h] of [[-.49,.42,.245,.165],[-.28,-.43,.29,.19],[.59,-.10,.105,.34]])mountShape.holes.push(shapeHole(roundedShape(w,h,.006,x,y)));
  const center=new THREE.Path();center.absarc(0,.015,.123,0,2*Math.PI,true);mountShape.holes.push(center);
  const mountGeometry=extrude(mountShape,.245,.018);
  const mountPositions=mountGeometry.attributes.position;
  for(let i=0;i<mountPositions.count;i++){const y=mountPositions.getY(i),z=mountPositions.getZ(i);mountPositions.setZ(i,z*(.30-.18*y)/.245);}
  mountGeometry.computeVertexNormals();
  add(mountGeometry,housing,[0,0,0],mountGroup,'Wedge mount with keyed through cutouts');
  const lipShape=roundedShape(1.84,1.27,.04);lipShape.holes.push(shapeHole(roundedShape(1.79,1.22,.028)));
  const lipGeometry=extrude(lipShape,.008,.001);const lp=lipGeometry.attributes.position;
  for(let i=0;i<lp.count;i++)lp.setZ(i,lp.getZ(i)+.321-.18*lp.getY(i));
  lipGeometry.computeVertexNormals();add(lipGeometry,panelMat,[0,0,0],mountGroup,'Fine mounting perimeter lip');
  disk(.118,.013,nickel,[0,.015,.302],mountGroup);disk(.091,.015,brass,[0,.015,.312],mountGroup);disk(.066,.017,voidMat,[0,.015,.319],mountGroup);
  for(let i=0;i<4;i++)ring(.07+i*.004,.0035,brass,[0,.015,.322+i*.001],mountGroup);
  disk(.025,.009,voidMat,[-.30,.21,.285],mountGroup);

  // Fine perforations are merged to keep the web model's draw count manageable.
  const perforations=[];
  function addPerforation(x,y,z,r=.0105,angle=0){const g=new THREE.CylinderGeometry(r,r,.008,8);g.rotateX(Math.PI/2+angle);g.translate(x,y,z);perforations.push(g);}
  for(let row=0;row<4;row++)for(let col=0;col<24;col++)addPerforation((col-11.5)*.069,-.015-row*.055,.766);
  for(let row=0;row<3;row++)for(let col=0;col<24;col++)addPerforation((col-11.5)*.069,1.52+row*.05,.689-row*.028,.0105,-.4);
  // Speaker patches on the sculpted rear.
  for(const patch of [{y:.87,cols:17,rows:6,z:-.555},{y:-.12,cols:9,rows:9,z:-.735}])
    for(let row=0;row<patch.rows;row++)for(let col=0;col<patch.cols;col++)addPerforation((col-(patch.cols-1)/2)*.045,patch.y+(row-(patch.rows-1)/2)*.045,patch.z);
  add(mergeGeometries(perforations),voidMat,[0,0,0],root,'Speaker and ventilation perforations');
  perforations.forEach(g=>g.dispose());
  // Rear in-cabin module has its own three different optical windows.
  const rear=new THREE.Group();rear.name='Rear optical and infrared window strip';rear.position.set(0,-1.03,-1.085);rear.rotation.x=Math.PI;root.add(rear);
  box(1.47,.56,.15,.063,edgeMat,[0,0,.025],rear);
  box(1.37,.45,.013,.035,panelMat,[0,0,.109],rear);
  disk(.191,.008,mat('Infrared window','#727080',.22,.18),[.435,0,.122],rear);
  ring(.194,.008,rubber,[.435,0,.129],rear);
  disk(.110,.012,lensMetal,[-.133,0,.123],rear);disk(.083,.012,mat('Rear lens coating','#49324e',.18,.5),[-.133,0,.135],rear);
  disk(.043,.010,mat('Light sensor','#867c93',.24,.2),[-.504,0,.123],rear);
  // Two wires under a common relief boot, matching the reference silhouette.
  const cable=new THREE.Group();cable.name='Dual conductor cable and molded strain relief';cable.position.set(.26,1.78,.015);cable.rotation.z=.12;root.add(cable);
  add(new THREE.CylinderGeometry(.142,.21,.41,48),rubber,[0,.075,0],cable);
  for(let i=0;i<6;i++){
    const r=ring(.197-i*.010,.015,edgeMat,[0,-.087+i*.057,0],cable);r.rotation.x=Math.PI/2;
  }
  for(const sign of [-1,1]){
    const path=new THREE.CatmullRomCurve3([new THREE.Vector3(sign*.054,.26,0),new THREE.Vector3(sign*.054+.02,.53,-.007),new THREE.Vector3(sign*.054+.035,.99,-.025),new THREE.Vector3(sign*.054+.05,1.5,-.035)]);
    add(new THREE.TubeGeometry(path,36,.067,16,false),rubber,[0,0,0],cable);
  }
  const collar=add(new THREE.CylinderGeometry(.145,.152,.24,32),edgeMat,[.027,.69,-.015],cable);collar.rotation.z=-.035;
  // The third supplied view shows an optional lock; keep it a separate assembly.
  const lock=new THREE.Group();lock.name='Optional side security lock';lock.position.set(1.16,.67,.02);lock.rotation.y=Math.PI/2;root.add(lock);
  box(.55,.84,.10,.19,panelMat,[0,0,0],lock);disk(.233,.30,rubber,[0,0,.17],lock);disk(.182,.066,nickel,[0,0,.347],lock);disk(.117,.009,panelMat,[0,0,.387],lock);box(.034,.142,.009,.005,edgeMat,[0,0,.396],lock);
  lock.visible=false;
  Object.defineProperty(root.userData,'setLockVisible',{enumerable:false,value:(value)=>{lock.visible=Boolean(value);}});
  // Match the manufacturer's overall enclosure dimensions (cable and lock excluded).
  const enclosureBounds=new THREE.Box3();
  root.updateMatrixWorld(true);
  for(const child of root.children)if(child!==cable && child!==lock)enclosureBounds.expandByObject(child);
  const enclosureSize=enclosureBounds.getSize(new THREE.Vector3());
  root.scale.set(2.3/enclosureSize.x,(109/30)/enclosureSize.y,(52/30)/enclosureSize.z);
  root.userData.nominalDimensionsMM={length:109,width:69,height:52};
  root.userData.metersPerModelUnit=.03;
  root.userData.geometrySource='Estimated reconstruction from official JC400P images; not manufacturer CAD';
  return root;
}
