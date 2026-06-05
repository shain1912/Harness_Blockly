import React, { useEffect, useRef } from 'react';

export default function Stage({ 
  spriteState, 
  drawnLines, 
  isRunning, 
  isPaused, 
  onRun, 
  onPause, 
  onStep, 
  onStop, 
  onClearCanvas,
  runSpeed, 
  onSpeedChange 
}) {
  const canvasRef = useRef(null);
  const bubbleRef = useRef(null);

  // Map canvas coordinate system stats
  const canvasWidth = 480;
  const canvasHeight = 280;
  const mathX = Math.round(spriteState.x - canvasWidth / 2);
  const mathY = Math.round(canvasHeight / 2 - spriteState.y);
  const mathAngle = Math.round(spriteState.angle);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let frame = 0;
    let animationId;

    const render = () => {
      // 1. Clear background grid — warm cream canvas (Claude theme)
      ctx.fillStyle = '#faf9f5';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // Draw Cartesian coordinate grid lines
      ctx.strokeStyle = 'rgba(20, 20, 19, 0.05)';
      ctx.lineWidth = 1;
      for (let x = 40; x < canvasWidth; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();
      }
      for (let y = 40; y < canvasHeight; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasWidth, y);
        ctx.stroke();
      }

      // Draw Center Axes
      ctx.strokeStyle = 'rgba(93, 184, 166, 0.35)';
      ctx.beginPath();
      ctx.moveTo(canvasWidth / 2, 0);
      ctx.lineTo(canvasWidth / 2, canvasHeight);
      ctx.moveTo(0, canvasHeight / 2);
      ctx.lineTo(canvasWidth, canvasHeight / 2);
      ctx.stroke();

      // 2. Draw all path lines created by pen
      drawnLines.forEach(line => {
        ctx.strokeStyle = line.color || '#a855f7';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();
      });

      // 3. Draw spaceship/turtle sprite
      ctx.save();
      ctx.translate(spriteState.x, spriteState.y);
      // Math canvas coords decrease in Y, and standard math angles are counter-clockwise
      ctx.rotate(-spriteState.angle * Math.PI / 180);

      // Draw glowing fire particles from thruster if executing moves
      if (isRunning && !isPaused && frame % 4 < 2) {
        ctx.fillStyle = 'rgba(236, 72, 153, 0.8)';
        ctx.beginPath();
        ctx.arc(-16, 0, 5 + Math.sin(frame) * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(234, 179, 8, 0.6)';
        ctx.beginPath();
        ctx.arc(-22, 0, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw the sprite — warm coral→teal, tuned for the cream canvas
      ctx.strokeStyle = '#cc785c';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 6;
      ctx.shadowColor = 'rgba(204, 120, 92, 0.45)';

      ctx.beginPath();
      ctx.moveTo(12, 0); // Head nose cone
      ctx.lineTo(-10, -10); // Left wing
      ctx.lineTo(-6, 0); // Tail hull
      ctx.lineTo(-10, 10); // Right wing
      ctx.closePath();

      const shipGrad = ctx.createLinearGradient(-10, 0, 12, 0);
      shipGrad.addColorStop(0, '#cc785c');
      shipGrad.addColorStop(1, '#5db8a6');
      ctx.fillStyle = shipGrad;
      ctx.fill();
      ctx.stroke();
      
      ctx.restore();

      frame++;
      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [spriteState, drawnLines, isRunning, isPaused]);

  // Handle bubble placement dynamically based on canvas bounding rect
  useEffect(() => {
    const bubble = bubbleRef.current;
    const canvas = canvasRef.current;
    if (!bubble || !canvas || spriteState.sayBubble === null) return;

    const canvasRect = canvas.getBoundingClientRect();
    bubble.style.left = `${canvasRect.left + spriteState.x - 20}px`;
    bubble.style.top = `${canvasRect.top + spriteState.y - 45}px`;
  }, [spriteState]);

  return (
    <div className="stage-card">
      <div className="panel-header">
        <div className="panel-title-group">
          <i className="fa-solid fa-gauge-high icon-cyan"></i>
          <h3>Interactive Stage</h3>
        </div>
        <div className="stage-stats">
          <span id="coord-display">X: {mathX}, Y: {mathY} | A: {mathAngle}°</span>
        </div>
      </div>
      <div className="canvas-wrapper">
        <canvas ref={canvasRef} id="stage-canvas" width={canvasWidth} height={canvasHeight}></canvas>
        <div 
          ref={bubbleRef} 
          id="sprite-bubble" 
          className={`speech-bubble ${spriteState.sayBubble === null ? 'hidden' : ''}`}
        >
          {spriteState.sayBubble}
        </div>
      </div>
      <div className="stage-controls">
        <button 
          className="btn btn-action play" 
          id="btn-run" 
          onClick={onRun}
          title="Run (F5)"
        >
          <i className="fa-solid fa-play"></i> Run
        </button>
        <button 
          className="btn btn-action pause" 
          id="btn-pause" 
          onClick={onPause}
          disabled={!isRunning || isPaused}
          title="Pause"
        >
          <i className="fa-solid fa-pause"></i>
        </button>
        <button 
          className="btn btn-action step" 
          id="btn-step" 
          onClick={onStep}
          title="Step Node"
        >
          <i className="fa-solid fa-forward-step"></i> Step
        </button>
        <button 
          className="btn btn-action stop" 
          id="btn-stop" 
          onClick={onStop}
          disabled={!isRunning}
          title="Stop & Reset"
        >
          <i className="fa-solid fa-stop"></i>
        </button>
        <div className="speed-slider-group">
          <i className="fa-solid fa-bolt"></i>
          <input 
            type="range" 
            id="run-speed" 
            min="1" 
            max="100" 
            value={runSpeed} 
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            title="Execution Delay Speed" 
          />
        </div>
        <button 
          className="btn btn-secondary btn-icon-only" 
          id="btn-clear-canvas" 
          onClick={onClearCanvas}
          title="Clear Path & Drawing"
        >
          <i className="fa-solid fa-eraser"></i>
        </button>
      </div>
    </div>
  );
}
