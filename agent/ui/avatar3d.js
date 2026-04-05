/* SILERS AI — 3D Robot Avatar (RobotExpressive GLB) with Lip-Sync */
let _av={scene:null,camera:null,renderer:null,model:null,mixer:null,actions:{},morphHead:null,state:'idle',clock:null,_pendingState:'idle'};

function setAvatarState(state){
  if(typeof _ttsIsSpeaking!=='undefined' && _ttsIsSpeaking && state!=='talking'){
    _av._pendingState=state;
    return;
  }
  _av.state=state;
  _av._pendingState=state;
  _applyAnimation(state);
}

function _applyAnimation(state){
  if(!_av.mixer||!_av.actions)return;
  const a=_av.actions;
  // Fade all out
  Object.values(a).forEach(act=>{if(act)act.fadeOut(0.4)});
  // Play matching
  let target=null;
  if(state==='idle') target=a.Idle;
  else if(state==='thinking') target=a.Idle; // idle + morph expressions
  else if(state==='talking') target=a.Idle;   // idle + lip-sync morph
  else if(state==='fixing') target=a.Running||a.Dance||a.Idle;
  if(target){target.reset().fadeIn(0.4).play()}
}

async function initAvatar3D(containerId){
  // Load Three.js
  if(!window.THREE){
    await new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      s.onload=res;s.onerror=rej;
      document.head.appendChild(s);
    });
  }
  // Load GLTFLoader
  if(!window.THREE.GLTFLoader){
    await new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js';
      s.onload=res;s.onerror=rej;
      document.head.appendChild(s);
    });
  }

  const THREE=window.THREE;
  const container=document.getElementById(containerId);
  if(!container)return;

  const W=container.clientWidth||200;
  const H=container.clientHeight||220;

  // Scene
  const scene=new THREE.Scene();
  _av.scene=scene;

  // Camera
  const camera=new THREE.PerspectiveCamera(28,W/H,0.1,100);
  camera.position.set(0,1.0,5);
  camera.lookAt(0,0.8,0);
  _av.camera=camera;

  // Renderer
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
  renderer.setSize(W,H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.setClearColor(0x000000,0);
  renderer.outputEncoding=THREE.sRGBEncoding;
  container.innerHTML='';
  container.appendChild(renderer.domElement);
  _av.renderer=renderer;

  // Lighting
  scene.add(new THREE.AmbientLight(0x8090c0,0.8));
  const key=new THREE.DirectionalLight(0xffffff,1.0);
  key.position.set(3,5,5);scene.add(key);
  const fill=new THREE.PointLight(0x4F8CFF,0.5,12);
  fill.position.set(-3,2,4);scene.add(fill);
  const rim=new THREE.PointLight(0x8B5CF6,0.3,10);
  rim.position.set(2,0,-3);scene.add(rim);

  // Floor glow ring
  const ringGeo=new THREE.TorusGeometry(0.8,0.008,8,48);
  const ringMat=new THREE.MeshBasicMaterial({color:0x4F8CFF,transparent:true,opacity:0.25});
  const ring=new THREE.Mesh(ringGeo,ringMat);
  ring.rotation.x=Math.PI/2;
  ring.position.y=0.01;
  scene.add(ring);
  _av.ring=ring;

  // Load GLB model
  const loader=new THREE.GLTFLoader();
  loader.load('robot.glb',gltf=>{
    const model=gltf.scene;
    model.scale.set(0.7,0.7,0.7);
    model.position.set(0,0,0);
    scene.add(model);
    _av.model=model;

    // Find morph target mesh (Head)
    model.traverse(child=>{
      if(child.isMesh && child.morphTargetInfluences){
        _av.morphHead=child;
        // Store morph target names for reference
        if(child.morphTargetDictionary){
          _av.morphNames=child.morphTargetDictionary;
        }
      }
    });

    // Setup animation mixer
    const mixer=new THREE.AnimationMixer(model);
    _av.mixer=mixer;

    // Map all animations by name
    const actions={};
    gltf.animations.forEach(clip=>{
      actions[clip.name]=mixer.clipAction(clip);
      actions[clip.name].clampWhenFinished=true;
    });
    _av.actions=actions;

    // Start idle
    if(actions.Idle){actions.Idle.play()}

  },undefined,err=>{
    console.error('Failed to load robot model:',err);
    // Fallback: show placeholder
    container.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:48px">🤖</div>';
  });

  _av.clock=new THREE.Clock();
  animate();

  // Resize
  const ro=new ResizeObserver(()=>{
    const w=container.clientWidth;const h=container.clientHeight;
    camera.aspect=w/h;camera.updateProjectionMatrix();
    renderer.setSize(w,h);
  });
  ro.observe(container);
}

function animate(){
  requestAnimationFrame(animate);
  if(!_av.renderer)return;
  const dt=_av.clock.getDelta();
  const t=_av.clock.getElapsedTime();
  const state=_av.state;

  // Update animation mixer
  if(_av.mixer) _av.mixer.update(dt);

  // Morph target expressions
  if(_av.morphHead && _av.morphNames){
    const m=_av.morphHead.morphTargetInfluences;
    const n=_av.morphNames;

    if(state==='talking'){
      // Lip-sync: animate mouth via morph targets
      const m1=Math.abs(Math.sin(t*13));
      const m2=Math.abs(Math.sin(t*9.3)*0.6);
      const m3=Math.abs(Math.sin(t*21)*0.3);
      const open=(m1+m2+m3)/3;

      // Surprised morph opens mouth
      if(n.Surprised!==undefined) m[n.Surprised]=open*0.7;
      // Happy for friendly look while talking
      if(n.Happy!==undefined) m[n.Happy]=0.3;
      if(n.Sad!==undefined) m[n.Sad]=0;
      if(n.Angry!==undefined) m[n.Angry]=0;

    }else if(state==='thinking'){
      // Slight concerned/focused expression
      if(n.Surprised!==undefined) m[n.Surprised]*=0.9;
      if(n.Happy!==undefined) m[n.Happy]+=(0.15-m[n.Happy])*0.05;
      if(n.Sad!==undefined) m[n.Sad]+=(0.2+Math.sin(t*1.5)*0.1-m[n.Sad])*0.05;
      if(n.Angry!==undefined) m[n.Angry]*=0.95;

    }else if(state==='fixing'){
      // Determined/focused
      if(n.Surprised!==undefined) m[n.Surprised]*=0.9;
      if(n.Happy!==undefined) m[n.Happy]+=(0.1-m[n.Happy])*0.05;
      if(n.Angry!==undefined) m[n.Angry]+=(0.15-m[n.Angry])*0.05;
      if(n.Sad!==undefined) m[n.Sad]*=0.95;

    }else{
      // Idle — friendly smile, all morphs return to neutral
      if(n.Happy!==undefined) m[n.Happy]+=(0.4-m[n.Happy])*0.03;
      if(n.Surprised!==undefined) m[n.Surprised]*=0.92;
      if(n.Sad!==undefined) m[n.Sad]*=0.95;
      if(n.Angry!==undefined) m[n.Angry]*=0.95;
    }
  }

  // Gentle float for model
  if(_av.model){
    _av.model.position.y=Math.sin(t*0.8)*0.03;
    // Subtle rotation when thinking
    if(state==='thinking'){
      _av.model.rotation.y=Math.sin(t*0.5)*0.1;
    }else{
      _av.model.rotation.y+=(0-_av.model.rotation.y)*0.03;
    }
  }

  // Ring glow
  if(_av.ring){
    _av.ring.material.opacity=state==='idle'?0.15+Math.sin(t)*0.05:
                               state==='fixing'?0.3+Math.sin(t*3)*0.1:
                               0.2+Math.sin(t*1.5)*0.08;
    _av.ring.rotation.z=t*0.2;
  }

  if(_av.scene&&_av.camera) _av.renderer.render(_av.scene,_av.camera);
}
