import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ResearchState } from '../../types/research';
import { ResearchGraph } from '../graph/ResearchGraph';
import { ShieldCheck, Crosshair, X, PenTool, Eraser, Download, MousePointer2 } from 'lucide-react';
// @ts-ignore
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import html2canvas from 'html2canvas';

interface JarvisModeProps {
  state: ResearchState;
  onExit: () => void;
  onSelectItem: (item: any) => void;
}

type Tool = 'pointer' | 'marker' | 'eraser';

export function JarvisMode({ state, onExit, onSelectItem }: JarvisModeProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [gesture, setGesture] = useState<string>('Initializing Camera...');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: -100, y: -100 });
  const [selectedNodeData, setSelectedNodeData] = useState<any>(null);
  const [tool, setTool] = useState<Tool>('pointer');

  // Virtual Notebook Panning & Dragging Nodes
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [placedNodes, setPlacedNodes] = useState<Array<{ id: string; x: number; y: number; data: any }>>([]);
  const draggingNodeRef = useRef<any>(null);

  // Refs for tracking movement without triggering re-renders in the loop
  const panState = useRef({ x: 0, y: 0, isPanning: false, lastHandsX: 0, lastHandsY: 0 });
  const isDrawing = useRef(false);
  const lastDrawPos = useRef({ x: 0, y: 0 });
  const currentTool = useRef<Tool>('pointer');

  // Update ref when state changes so the loop sees it
  useEffect(() => { currentTool.current = tool; }, [tool]);

  // Set up canvas size
  useEffect(() => {
    if (canvasRef.current && containerRef.current) {
      // Create a massive canvas to allow drawing when panned
      canvasRef.current.width = window.innerWidth * 3;
      canvasRef.current.height = window.innerHeight * 3;
      // Center the origin of drawing area
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, []);

  const drawOnCanvas = (x: number, y: number, isDrawingActive: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // The canvas is 3x the window, positioned at -100vw, -100vh.
    // The canvas container is ONLY inside the right 70% panel now, but we'll map absolute coordinates.
    // Let's just use bounding client rect of container.
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Relative to the 300vw canvas container taking into account CSS translation
    const canvasX = x - rect.left - panState.current.x + window.innerWidth;
    const canvasY = y - rect.top - panState.current.y + window.innerHeight;

    if (isDrawingActive) {
      if (!isDrawing.current) {
        isDrawing.current = true;
        lastDrawPos.current = { x: canvasX, y: canvasY };
        ctx.beginPath();
        ctx.moveTo(canvasX, canvasY);
        ctx.lineTo(canvasX, canvasY);
        ctx.stroke();
      } else {
        if (currentTool.current === 'marker') {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = '#06b6d4'; // Cyan
          ctx.lineWidth = 4;
        } else if (currentTool.current === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.lineWidth = 40; // thick eraser
        }

        ctx.beginPath();
        ctx.moveTo(lastDrawPos.current.x, lastDrawPos.current.y);
        ctx.lineTo(canvasX, canvasY);
        ctx.stroke();
        lastDrawPos.current = { x: canvasX, y: canvasY };
      }
    } else {
      isDrawing.current = false;
      ctx.beginPath();
    }
  };

  useEffect(() => {
    let handLandmarker: any;
    let animationFrameId: number;
    let stream: MediaStream | null = null;

    const initMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2 // Changed to 2 for panning
        });

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
            setIsCameraActive(true);
            setGesture('Tracking Active');
          }
        }
      } catch (err) {
        console.error("MediaPipe Error", err);
        setGesture('Camera Error - Mouse Fallback Active');
      }
    };

    initMediaPipe();

    let lastVideoTime = -1;
    const renderLoop = async () => {
      if (videoRef.current && videoRef.current.readyState >= 2 && handLandmarker) {
        const startTimeMs = performance.now();
        if (lastVideoTime !== videoRef.current.currentTime) {
          lastVideoTime = videoRef.current.currentTime;
          const results = handLandmarker.detectForVideo(videoRef.current, startTimeMs);

          if (results.landmarks && results.landmarks.length > 0) {

            // Check for Two Hands -> Panning Mode
            if (results.landmarks.length === 2) {
              setGesture('Both Palms Detected (Panning Notebook)');
              const hand1 = results.landmarks[0][0]; // wrist of hand 1
              const hand2 = results.landmarks[1][0]; // wrist of hand 2

              const avgX = ((1 - hand1.x) + (1 - hand2.x)) / 2 * window.innerWidth;
              const avgY = (hand1.y + hand2.y) / 2 * window.innerHeight;

              if (!panState.current.isPanning) {
                panState.current.isPanning = true;
                panState.current.lastHandsX = avgX;
                panState.current.lastHandsY = avgY;
              } else {
                const dx = avgX - panState.current.lastHandsX;
                const dy = avgY - panState.current.lastHandsY;

                panState.current.x += dx * 1.5; // multiplier for faster panning
                panState.current.y += dy * 1.5;

                panState.current.lastHandsX = avgX;
                panState.current.lastHandsY = avgY;

                // Update react state to trigger CSS transform render
                setPanOffset({ x: panState.current.x, y: panState.current.y });
              }

              isDrawing.current = false;
            } else {
              // Single Hand -> Pointer/Marker/Eraser
              panState.current.isPanning = false;

              const landmarks = results.landmarks[0];
              const indexTip = landmarks[8];
              const thumbTip = landmarks[4];

              const screenX = (1 - indexTip.x) * window.innerWidth;
              const screenY = indexTip.y * window.innerHeight;

              setCursorPos(prev => ({
                x: prev.x < 0 ? screenX : prev.x * 0.7 + screenX * 0.3,
                y: prev.y < 0 ? screenY : prev.y * 0.7 + screenY * 0.3
              }));

              const distance = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
              const isPinching = distance < 0.05;

              // Marker writes without pinching
              const isDrawingActive = currentTool.current === 'marker' ? true : isPinching;

              if (currentTool.current === 'pointer') {

                // Hover Highlight Logic
                const hoveredEl = document.elementFromPoint(screenX, screenY);
                const nodeEl = hoveredEl?.closest('.react-flow__node');

                document.querySelectorAll('.jarvis-highlight').forEach(el => el.classList.remove('ring-4', 'ring-cyan-400', 'shadow-[0_0_15px_#22d3ee]', 'jarvis-highlight'));
                let hoveredNodeData = null;
                if (nodeEl) {
                  nodeEl.classList.add('ring-4', 'ring-cyan-400', 'shadow-[0_0_15px_#22d3ee]', 'jarvis-highlight');
                  hoveredNodeData = {
                    type: 'Extracted Node',
                    content: nodeEl.textContent || 'Unknown Data'
                  };
                }

                if (isPinching) {
                  if (screenX < window.innerWidth * 0.3) {
                    setGesture('Pointer: Extracting Node');
                    if (!draggingNodeRef.current && hoveredNodeData) {
                      draggingNodeRef.current = hoveredNodeData;
                    }
                  } else {
                    setGesture('Pointer: Dropping Node');
                  }
                } else {
                  setGesture('Open Palm: Hover');
                  if (draggingNodeRef.current && screenX > window.innerWidth * 0.3) {
                    // Drop node
                    const rect = containerRef.current?.getBoundingClientRect();
                    if (rect) {
                      const dropX = screenX - rect.left;
                      const dropY = screenY - rect.top;
                      setPlacedNodes(prev => [...prev, { id: `n-${Date.now()}`, x: dropX, y: dropY, data: draggingNodeRef.current }]);
                    }
                  }
                  draggingNodeRef.current = null;
                }
              } else if (currentTool.current === 'marker') {
                setGesture('Marker: Writing');
                drawOnCanvas(screenX, screenY, isDrawingActive);
              } else if (currentTool.current === 'eraser') {
                if (isPinching) setGesture('Eraser: Erasing');
                else setGesture('Eraser: Hover');
                drawOnCanvas(screenX, screenY, isDrawingActive);
              }
            }
          } else {
            setGesture('No Hands Detected');
            setCursorPos({ x: -100, y: -100 });
            isDrawing.current = false;
            panState.current.isPanning = false;
          }
        }
      }
      animationFrameId = requestAnimationFrame(renderLoop);
    };

    videoRef.current?.addEventListener('loadeddata', renderLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (handLandmarker) handLandmarker.close();
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, []);

  const handleExport = useCallback(async () => {
    if (containerRef.current) {
      setGesture('Exporting Snapshot...');
      try {
        const canvas = await html2canvas(containerRef.current, { backgroundColor: '#0a0a0a' });
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `Vikaas_Jarvis_Notebook_${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
        setGesture('Export Complete');
      } catch (e) {
        console.error(e);
        setGesture('Export Failed');
      }
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950 text-cyan-500 overflow-hidden font-mono selection:bg-cyan-900 flex flex-col">
      {/* JARVIS Overlay UI */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-[200] pointer-events-none">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-8 h-8 text-cyan-400" />
          <div>
            <h1 className="text-xl font-bold tracking-widest text-cyan-400 uppercase">J.A.R.V.I.S. INTERFACE</h1>
            <p className="text-xs text-cyan-600">VIRTUAL NOTEBOOK PROTOCOL [ACTIVE]</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="bg-cyan-950/80 border border-cyan-800/80 px-3 py-1.5 rounded text-xs text-cyan-300 font-bold uppercase backdrop-blur-sm">
            GESTURE: {gesture}
          </div>
          <button
            onClick={onExit}
            className="pointer-events-auto mt-2 px-5 py-2 bg-cyan-900/50 hover:bg-cyan-800/80 border border-cyan-500 text-cyan-100 text-xs font-bold rounded transition-all cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.4)] backdrop-blur-sm"
          >
            EXIT JARVIS MODE
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="absolute left-6 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-[200]">
        <button onClick={() => setTool('pointer')} className={`p-3 rounded-xl border transition-all ${tool === 'pointer' ? 'bg-cyan-600 border-cyan-400 text-white shadow-[0_0_15px_rgba(6,182,212,0.6)]' : 'bg-neutral-900/80 border-cyan-900 text-cyan-500 hover:bg-neutral-800 backdrop-blur-md'}`} title="Pointer Tool">
          <MousePointer2 className="w-5 h-5" />
        </button>
        <button onClick={() => setTool('marker')} className={`p-3 rounded-xl border transition-all ${tool === 'marker' ? 'bg-cyan-600 border-cyan-400 text-white shadow-[0_0_15px_rgba(6,182,212,0.6)]' : 'bg-neutral-900/80 border-cyan-900 text-cyan-500 hover:bg-neutral-800 backdrop-blur-md'}`} title="Marker Tool">
          <PenTool className="w-5 h-5" />
        </button>
        <button onClick={() => setTool('eraser')} className={`p-3 rounded-xl border transition-all ${tool === 'eraser' ? 'bg-cyan-600 border-cyan-400 text-white shadow-[0_0_15px_rgba(6,182,212,0.6)]' : 'bg-neutral-900/80 border-cyan-900 text-cyan-500 hover:bg-neutral-800 backdrop-blur-md'}`} title="Eraser Tool">
          <Eraser className="w-5 h-5" />
        </button>
        <div className="h-px bg-cyan-900/50 my-1 w-full" />
        <button onClick={handleExport} className="p-3 rounded-xl bg-neutral-900/80 border border-emerald-800 text-emerald-400 hover:bg-emerald-900/50 hover:text-emerald-300 transition-all backdrop-blur-md" title="Export Snapshot">
          <Download className="w-5 h-5" />
        </button>
      </div>

      {/* Hidden Video for tracking */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* Custom Hand Cursor */}
      {isCameraActive && cursorPos.x >= 0 && (
        <div
          className="fixed pointer-events-none z-[300] transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center transition-all duration-75"
          style={{ left: cursorPos.x, top: cursorPos.y }}
        >
          {tool === 'pointer' && <Crosshair className="w-6 h-6 text-cyan-300 opacity-80" />}
          {tool === 'marker' && <PenTool className="w-5 h-5 text-cyan-400 fill-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]" />}
          {tool === 'eraser' && <div className="w-10 h-10 border-2 border-dashed border-rose-400 rounded-full bg-rose-500/20" />}
        </div>
      )}

      {/* Virtual Notebook Split View */}
      <div className="flex-1 w-full h-full flex p-4 pt-20 gap-4">

        {/* 30% Research Graph */}
        <div className="w-[30%] h-full rounded-2xl border-2 border-cyan-900/50 overflow-hidden relative shadow-lg bg-neutral-950/80 shrink-0">
          <ResearchGraph
            state={state}
            isStatic={true}
            onSelectItem={useCallback((item: any) => {
              if (tool === 'pointer') {
                setSelectedNodeData(item);
                onSelectItem(item);
                draggingNodeRef.current = item;
              }
            }, [tool, onSelectItem])}
          />
          <div className="absolute top-2 left-2 text-[10px] text-cyan-500 bg-neutral-900/80 px-2 py-1 rounded font-bold">ARENA GRAPH (Pinch to Extract)</div>
        </div>

        {/* 70% Notepad */}
        <div
          className="flex-1 h-full rounded-2xl border-2 border-cyan-800/30 bg-neutral-900/40 relative overflow-hidden shadow-[inset_0_0_50px_rgba(6,182,212,0.05)]"
          style={{ cursor: tool === 'marker' ? 'crosshair' : tool === 'eraser' ? 'cell' : 'default' }}
        >
          <div className="absolute top-2 left-2 text-[10px] text-cyan-500 bg-neutral-900/80 px-2 py-1 rounded font-bold z-[160]">WORKSPACE NOTEBOOK</div>

          <div
            ref={containerRef}
            className="absolute w-[300vw] h-[300vh] left-[-100vw] top-[-100vh] will-change-transform transition-transform duration-75"
            style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px)` }}
          >
            {/* Drawing Canvas Overlay */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 pointer-events-none z-[150]"
            />

            {/* Placed Nodes */}
            {placedNodes.map(node => (
              <div
                key={node.id}
                className="absolute bg-neutral-950/90 border border-cyan-500/50 p-3 rounded-lg shadow-lg w-64 z-[140]"
                style={{ left: node.x, top: node.y }}
              >
                <div className="text-[10px] font-bold text-cyan-300 mb-1 border-b border-cyan-900/50 pb-1">{node.data.type?.toUpperCase() || 'EXTRACTED NODE'}</div>
                <div className="text-[9px] text-cyan-100 overflow-hidden break-words max-h-24 custom-scrollbar">
                  {JSON.stringify(node.data, null, 2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Jarvis Node Inspector Overlay */}
      {selectedNodeData && (
        <div className="absolute bottom-10 right-10 w-96 bg-neutral-950/90 border border-cyan-500/50 p-4 rounded-xl backdrop-blur-md shadow-[0_0_30px_rgba(6,182,212,0.2)] pointer-events-auto z-[250]">
          <div className="flex justify-between items-center mb-3 border-b border-cyan-900/50 pb-2">
            <h3 className="text-sm font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              INSPECTOR: {selectedNodeData.type}
            </h3>
            <button onClick={() => setSelectedNodeData(null)} className="text-cyan-600 hover:text-cyan-300 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="text-xs text-cyan-200/80 space-y-2 overflow-y-auto max-h-60 custom-scrollbar">
            <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed">
              {JSON.stringify(selectedNodeData, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
