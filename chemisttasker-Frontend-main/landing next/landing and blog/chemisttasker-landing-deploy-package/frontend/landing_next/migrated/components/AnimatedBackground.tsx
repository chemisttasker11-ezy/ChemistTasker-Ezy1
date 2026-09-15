import { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import * as THREE from 'three';

const AnimatedBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    let scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer, network: THREE.Group;
    let mouseX = 0;
    // const canva  sContainer = canvasRef.current.parentElement as HTMLElement;

    const init = () => {
      scene = new THREE.Scene();
      // camera = new THREE.PerspectiveCamera(60, canvasContainer.offsetWidth / canvasContainer.offsetHeight, 1, 2000);
      camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 2000);

      camera.position.z = 500;

      renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current!, antialias: true, alpha: true });
      // renderer.setSize(canvasContainer.offsetWidth, canvasContainer.offsetHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);

      
      renderer.setClearColor(0xffffff, 0);

      network = new THREE.Group();
      scene.add(network);

      const nodeGeometry = new THREE.SphereGeometry(4, 16, 16);
      const nodeMaterial = new THREE.MeshBasicMaterial({ color: 0x00a99d }); // Teal
      const nodes: THREE.Mesh[] = [];
      for (let i = 0; i < 50; i++) {
        const node = new THREE.Mesh(nodeGeometry, nodeMaterial);
        node.position.set(
          (Math.random() - 0.5) * 1000,
          (Math.random() - 0.5) * 1000,
          (Math.random() - 0.5) * 1000
        );
        network.add(node);
        nodes.push(node);
      }

      const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00a99d, transparent: true, opacity: 0.1 });
      const pulseMaterial = new THREE.MeshBasicMaterial({ color: 0xc724b1 }); // Magenta
      const pulseGeometry = new THREE.SphereGeometry(2, 8, 8);
      nodes.forEach(startNode => {
        const endNode = nodes[Math.floor(Math.random() * nodes.length)];
        if (startNode === endNode) return;

        const points = [startNode.position, endNode.position];
        const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(lineGeometry, lineMaterial);
        network.add(line);

        if (Math.random() > 0.8) {
          const pulse = new THREE.Mesh(pulseGeometry, pulseMaterial);
          Object.assign(pulse.userData, {
            start: startNode.position,
            end: endNode.position,
            progress: Math.random()
          });
          network.add(pulse);
        }
      });

      const onMouseMove = (event: MouseEvent) => {
        mouseX = (event.clientX / window.innerWidth) * 2 - 1;
      };

      const onWindowResize = () => {
        if (!renderer.domElement.parentElement) return;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };

      document.addEventListener('mousemove', onMouseMove);
      window.addEventListener('resize', onWindowResize);

      let animationFrameId: number;
      const animate = () => {
        animationFrameId = requestAnimationFrame(animate);
        network.rotation.y += 0.0005 + (mouseX * 0.001);
        network.children.forEach((child: THREE.Object3D) => {
          if (child.userData.start) {
            child.userData.progress = (child.userData.progress + 0.01) % 1;
            child.position.lerpVectors(child.userData.start, child.userData.end, child.userData.progress);
          }
        });
        renderer.render(scene, camera);
      };

      animate();

      return () => {
        cancelAnimationFrame(animationFrameId);
        document.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('resize', onWindowResize);
        renderer.dispose();
      };
    };

    const cleanup = init();
    return cleanup;
  }, []);

  return (
    <Box
      ref={canvasRef}
      component="canvas"
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 1,
        pointerEvents: 'none', // <-- critical: never intercept wheel/click/touch
      }}
    />
  );
};

export default AnimatedBackground;