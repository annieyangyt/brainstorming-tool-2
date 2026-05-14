const { useState, useRef, useEffect } = React;


const ArtBrainstormTool = () => {
  const [nodes, setNodes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState(null);
  const [sidebarInfo, setSidebarInfo] = useState(null);
  const [loadingSidebar, setLoadingSidebar] = useState(false);
  const [markedNodes, setMarkedNodes] = useState({});
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [addingChildTo, setAddingChildTo] = useState(null);
  const [customInput, setCustomInput] = useState('');
  const svgRef = useRef(null);
  const containerRef = useRef(null);

  const markColors = [
    { name: '重要', color: '#FFD700', icon: '⭐' },
    { name: '喜欢', color: '#FF69B4', icon: '❤️' },
    { name: '待定', color: '#87CEEB', icon: '💭' },
    { name: '取消标记', color: null, icon: '✖️' }
  ];

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const calculateFontSize = (text, radius) => {
    const maxWidth = radius * 1.6;
    let fontSize = radius > 50 ? 18 : 15;
    while (fontSize > 8) {
      const estimatedWidth = text.length * fontSize * 0.6;
      if (estimatedWidth <= maxWidth) return fontSize;
      fontSize -= 1;
    }
    return 8;
  };

  const isOverlapping = (x, y, radius, existingNodes) => {
    return existingNodes.some(node => {
      const dx = node.x - x, dy = node.y - y;
      return Math.sqrt(dx * dx + dy * dy) < (radius + 45 + 20);
    });
  };

  const findNonOverlappingPosition = (baseX, baseY, angle, radius, existingNodes, attempts = 0) => {
    if (attempts > 50) return { x: baseX + (Math.random() - 0.5) * 100, y: baseY + (Math.random() - 0.5) * 100 };
    const x = baseX + Math.cos(angle) * radius;
    const y = baseY + Math.sin(angle) * radius;
    if (!isOverlapping(x, y, 40, existingNodes)) return { x, y };
    return findNonOverlappingPosition(baseX, baseY, angle + (Math.PI / 12) * (attempts % 3), radius + (attempts * 15), existingNodes, attempts + 1);
  };

  const callGeminiAPI = async (prompt) => {
    try {
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API调用失败: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
        console.error('API返回数据异常:', data);
        throw new Error('API返回数据格式错误');
      }
      
      return data.candidates[0].content.parts[0].text;
    } catch (error) {
      console.error('API调用错误:', error);
      throw error;
    }
  };

  const generateKeywords = async (keyword, parentId = null) => {
    setLoading(true);
    setError('');
    const isChinese = /[\u4e00-\u9fa5]/.test(keyword);
    const prompt = isChinese
      ? `作为艺术创作助手,请为关键词"${keyword}"生成8个相关的艺术概念。要求每个词2-4个中文字,只返回JSON格式,不要其他内容: {"keywords": ["词1","词2","词3","词4","词5","词6","词7","词8"]}`
      : `As an art assistant, generate 8 related artistic concepts for "${keyword}". Each 1-3 words. Return only JSON format, no other text: {"keywords": ["w1","w2","w3","w4","w5","w6","w7","w8"]}`;
    
    try {
      const text = await callGeminiAPI(prompt);
      const cleanText = text.replace(/```json|```/g, '').trim();
      const result = JSON.parse(cleanText);
      
      if (parentId === null) {
        const center = { id: Date.now(), text: keyword, x: 500, y: 400, level: 0 };
        const newNodes = [center];
        const newConns = [];
        result.keywords.forEach((kw, i) => {
          const pos = findNonOverlappingPosition(center.x, center.y, (i / result.keywords.length) * 2 * Math.PI, 180, newNodes);
          const child = { id: Date.now() + i + 1, text: kw, x: pos.x, y: pos.y, level: 1 };
          newNodes.push(child);
          newConns.push({ from: center.id, to: child.id });
        });
        setNodes(newNodes);
        setConnections(newConns);
      } else {
        const parent = nodes.find(n => n.id === parentId);
        const newNodes = [...nodes];
        const newConns = [...connections];
        result.keywords.forEach((kw, i) => {
          const pos = findNonOverlappingPosition(parent.x, parent.y, (Math.PI / 3) + (i / result.keywords.length) * Math.PI * 1.8, 140, newNodes);
          const child = { id: Date.now() + i + 1, text: kw, x: pos.x, y: pos.y, level: parent.level + 1 };
          newNodes.push(child);
          newConns.push({ from: parentId, to: child.id });
        });
        setNodes(newNodes);
        setConnections(newConns);
      }
    } catch (err) {
      setError(err.message || '生成失败，请重试');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSidebarInfo = async (keyword) => {
    setLoadingSidebar(true);
    const isChinese = /[\u4e00-\u9fa5]/.test(keyword);
    const prompt = isChinese
      ? `分析艺术关键词"${keyword}",只返回JSON格式,不要其他内容: {"category":"情绪/场景/视觉/叙事/材质/风格之一","value":"价值说明1-2句","directions":["方向1","方向2","方向3"],"scenarios":["场景1","场景2","场景3"]}`
      : `Analyze art keyword "${keyword}", return only JSON format, no other text: {"category":"one of Emotion/Scene/Visual/Narrative/Material/Style","value":"1-2 sentence value","directions":["d1","d2","d3"],"scenarios":["s1","s2","s3"]}`;
    
    try {
      const text = await callGeminiAPI(prompt);
      const cleanText = text.replace(/```json|```/g, '').trim();
      const result = JSON.parse(cleanText);
      setSidebarInfo(result);
    } catch (err) {
      console.error(err);
      setSidebarInfo(null);
    } finally {
      setLoadingSidebar(false);
    }
  };

  const handleStart = () => {
    if (inputValue.trim()) { 
      generateKeywords(inputValue.trim()); 
      setInputValue(''); 
    }
  };

  const handleNodeClick = (e, nodeId, nodeText) => {
    e.stopPropagation();
    if (!loading && !isDragging) { 
      setSelectedNode({ id: nodeId, text: nodeText }); 
      fetchSidebarInfo(nodeText); 
    }
  };

  const handleGenerateMore = () => {
    if (selectedNode) { 
      generateKeywords(selectedNode.text, selectedNode.id); 
      setSelectedNode(null); 
      setSidebarInfo(null); 
    }
  };

  const handleSearchPinterest = () => {
    if (selectedNode) {
      window.open(`https://www.pinterest.com/search/pins/?q=${encodeURIComponent(selectedNode.text + ' art')}`, '_blank');
    }
  };

  const handleQuickExpand = (e, nodeId, nodeText) => {
    e.stopPropagation();
    if (!loading) generateKeywords(nodeText, nodeId);
  };

  const handleQuickSearch = (e, nodeText) => {
    e.stopPropagation();
    window.open(`https://www.pinterest.com/search/pins/?q=${encodeURIComponent(nodeText + ' art')}`, '_blank');
  };

  const handleQuickAdd = (e, nodeId) => {
    e.stopPropagation();
    setAddingChildTo(nodeId);
    setCustomInput('');
  };

  const handleAddCustomNode = () => {
    if (!customInput.trim() || addingChildTo === null) return;
    const parent = nodes.find(n => n.id === addingChildTo);
    const angle = Math.random() * 2 * Math.PI;
    const pos = findNonOverlappingPosition(parent.x, parent.y, angle, 150, nodes);
    const newNode = {
      id: Date.now(),
      text: customInput.trim(),
      x: pos.x,
      y: pos.y,
      level: parent.level + 1,
      isCustom: true
    };
    setNodes(prev => [...prev, newNode]);
    setConnections(prev => [...prev, { from: addingChildTo, to: newNode.id }]);
    setAddingChildTo(null);
    setCustomInput('');
  };

  const handleMarkNode = (nodeId, markColor) => {
    setMarkedNodes(prev => {
      const next = { ...prev };
      if (markColor === null) delete next[nodeId];
      else next[nodeId] = markColor;
      return next;
    });
  };

  const closeSidebar = () => { 
    setSidebarInfo(null); 
    setSelectedNode(null); 
  };

  const getCategoryColor = (cat) => ({
    '情绪': '#E85D75', 'Emotion': '#E85D75',
    '场景': '#8B1538', 'Scene': '#8B1538',
    '视觉': '#A91D3A', 'Visual': '#A91D3A',
    '叙事': '#C7253E', 'Narrative': '#C7253E',
    '材质': '#6B4423', 'Material': '#6B4423',
    '风格': '#8B1538', 'Style': '#8B1538'
  }[cat] || '#666');

  const handleMouseDown = (e) => {
    if (e.target.tagName === 'svg' || e.target.tagName === 'line') {
      setIsDragging(true);
      setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setTransform(prev => ({ 
        ...prev, 
        x: e.clientX - dragStart.x, 
        y: e.clientY - dragStart.y 
      }));
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.3, Math.min(3, transform.scale * delta));
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const dx = mouseX - transform.x;
    const dy = mouseY - transform.y;
    setTransform(prev => ({ 
      scale: newScale, 
      x: mouseX - dx * (newScale / prev.scale), 
      y: mouseY - dy * (newScale / prev.scale) 
    }));
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => { 
        window.removeEventListener('mousemove', handleMouseMove); 
        window.removeEventListener('mouseup', handleMouseUp); 
      };
    }
  }, [isDragging, dragStart]);

  const getNodeColor = (level) => ['#8B1538', '#A91D3A', '#C7253E', '#E85D75', '#6B4423'][level % 5];

  // SVG 图标组件
  const PlusIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );

  const ImageIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  );

  const XIcon = ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );

  const Loader2Icon = ({ size = 24 }) => (
    <svg className="spin" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  );

  const SparklesIcon = ({ size = 64 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
    </svg>
  );

  const ZoomInIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8"/>
      <path d="m21 21-4.35-4.35"/>
      <line x1="11" y1="8" x2="11" y2="14"/>
      <line x1="8" y1="11" x2="14" y2="11"/>
    </svg>
  );

  const ZoomOutIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8"/>
      <path d="m21 21-4.35-4.35"/>
      <line x1="8" y1="11" x2="14" y2="11"/>
    </svg>
  );

  const Maximize2Icon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="15 3 21 3 21 9"/>
      <polyline points="9 21 3 21 3 15"/>
      <line x1="21" y1="3" x2="14" y2="10"/>
      <line x1="3" y1="21" x2="10" y2="14"/>
    </svg>
  );

  const SidebarContent = () => (
    <>
      <div style={{ padding: '24px', borderBottom: '1px solid #e7e5e4', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '22px', fontWeight: 300, color: 'black', letterSpacing: '-0.02em' }}>{selectedNode.text}</div>
          {sidebarInfo && (
            <div style={{ marginTop: '8px', display: 'inline-block', padding: '2px 12px', borderRadius: '999px', fontSize: '11px', fontWeight: 500, color: 'white', backgroundColor: getCategoryColor(sidebarInfo.category) }}>
              {sidebarInfo.category}
            </div>
          )}
        </div>
        <button onClick={closeSidebar} style={{ padding: '4px', cursor: 'pointer', background: 'none', border: 'none' }}>
          <XIcon size={20} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {loadingSidebar ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
            <Loader2Icon size={24} />
          </div>
        ) : sidebarInfo ? (
          <>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a8a29e', marginBottom: '10px' }}>标记颜色</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {markColors.map((mark, idx) => (
                  <button key={idx} onClick={() => handleMarkNode(selectedNode.id, mark.color)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', border: '1px solid #e7e5e4', cursor: 'pointer', fontSize: '13px', fontWeight: 300, backgroundColor: markedNodes[selectedNode.id] === mark.color ? '#f5f5f4' : 'white', transition: 'background 0.2s' }}>
                    <span>{mark.icon}</span><span style={{ color: '#44403c' }}>{mark.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a8a29e', marginBottom: '8px' }}>为什么选择这个词</div>
              <p style={{ color: '#44403c', lineHeight: 1.7, fontWeight: 300, fontSize: '14px' }}>{sidebarInfo.value}</p>
            </div>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a8a29e', marginBottom: '12px' }}>可继续发散的方向</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {sidebarInfo.directions.map((dir, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: '#e7e5e4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: '11px', fontWeight: 500, color: '#78716c' }}>{idx + 1}</span>
                    </div>
                    <p style={{ color: '#44403c', fontWeight: 300, lineHeight: 1.6, fontSize: '14px' }}>{dir}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a8a29e', marginBottom: '10px' }}>常见使用场景</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {sidebarInfo.scenarios.map((s, idx) => (
                  <div key={idx} style={{ padding: '8px 12px', backgroundColor: '#fafaf9', border: '1px solid #e7e5e4', fontWeight: 300, color: '#44403c', fontSize: '13px' }}>{s}</div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div style={{ padding: '16px', borderTop: '1px solid #e7e5e4', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button onClick={handleGenerateMore} disabled={loading}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', backgroundColor: loading ? '#d6d3d1' : 'black', color: 'white', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '12px', fontWeight: 300 }}>
          <PlusIcon /> 继续发散
        </button>
        <button onClick={handleSearchPinterest}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', backgroundColor: 'white', color: 'black', border: '1px solid black', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '12px', fontWeight: 300 }}>
          <ImageIcon /> 查找参考图
        </button>
      </div>
    </>
  );

  return (
    <div style={{ width: '100%', height: '100vh', backgroundColor: '#fafaf9', display: 'flex', flexDirection: 'column' }}>
      <svg width="0" height="0">
        <defs>
          <filter id="shadow"><feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.2"/></filter>
        </defs>
      </svg>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '32px', backgroundColor: 'white', borderBottom: '1px solid #e7e5e4' }}>
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>
              <h1 style={{ fontSize: '36px', fontWeight: 300, color: 'black', marginBottom: '24px', letterSpacing: '-0.02em' }}>艺术灵感头脑风暴</h1>
              {nodes.length === 0 ? (
                <div style={{ display: 'flex', gap: '12px' }}>
                  <input type="text" value={inputValue} onChange={e => setInputValue(e.target.value)}
                    onKeyPress={e => { if (e.key === 'Enter' && inputValue.trim()) handleStart(); }}
                    placeholder="输入关键词开始创作..."
                    style={{ flex: 1, padding: '16px 20px', backgroundColor: 'white', border: '2px solid #d6d3d1', borderRadius: 0, outline: 'none', fontSize: '18px' }}
                  />
                  <button onClick={handleStart} disabled={loading || !inputValue.trim()}
                    style={{ padding: '16px 32px', backgroundColor: inputValue.trim() ? 'black' : '#d6d3d1', color: 'white', border: 'none', cursor: inputValue.trim() ? 'pointer' : 'not-allowed', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '13px', fontWeight: 300 }}>
                    开始
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                  <p style={{ color: '#78716c', fontWeight: 300 }}>点击圆圈继续发散 · 拖拽移动 · 滚轮缩放 · {nodes.length} 个概念</p>
                  <button onClick={() => { setNodes([]); setConnections([]); setTransform({ x: 0, y: 0, scale: 1 }); setSidebarInfo(null); setSelectedNode(null); setMarkedNodes({}); }}
                    style={{ padding: '8px 20px', backgroundColor: 'white', border: '1px solid black', color: 'black', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '11px', fontWeight: 300, whiteSpace: 'nowrap' }}>
                    重新开始
                  </button>
                </div>
              )}
              {error && <p style={{ marginTop: '12px', color: '#b91c1c', fontWeight: 300 }}>{error}</p>}
            </div>
          </div>

          <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#fafaf9', cursor: isDragging ? 'grabbing' : 'grab' }} onWheel={handleWheel}>
            {loading && (
              <div style={{ position: 'absolute', top: '24px', left: '50%', transform: 'translateX(-50%)', backgroundColor: 'white', padding: '10px 20px', border: '1px solid #d6d3d1', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '10px', zIndex: 10 }}>
                <Loader2Icon size={18} />
                <span style={{ color: '#1c1917', fontWeight: 300, letterSpacing: '0.05em' }}>正在生成...</span>
              </div>
            )}

            {nodes.length > 0 && (
              <div style={{ position: 'absolute', bottom: '32px', right: '32px', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 10 }}>
                {[
                  { fn: () => setTransform(p => ({ ...p, scale: Math.min(3, p.scale * 1.2) })), icon: <ZoomInIcon /> },
                  { fn: () => setTransform(p => ({ ...p, scale: Math.max(0.3, p.scale * 0.8) })), icon: <ZoomOutIcon /> },
                  { fn: () => setTransform({ x: 0, y: 0, scale: 1 }), icon: <Maximize2Icon /> }
                ].map((btn, i) => (
                  <button key={i} onClick={btn.fn} 
                    style={{ padding: '10px', backgroundColor: 'white', border: '1px solid black', color: 'black', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'black'; e.currentTarget.style.color = 'white'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.color = 'black'; }}>
                    {btn.icon}
                  </button>
                ))}
              </div>
            )}

            <svg ref={svgRef} style={{ width: '100%', height: '100%' }} onMouseDown={handleMouseDown}>
              <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
                {connections.map((conn, i) => {
                  const from = nodes.find(n => n.id === conn.from);
                  const to = nodes.find(n => n.id === conn.to);
                  if (!from || !to) return null;
                  return <line key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#292524" strokeWidth="1.5" opacity="0.2" />;
                })}

                {nodes.map((node) => {
                  const color = getNodeColor(node.level);
                  const radius = node.level === 0 ? 55 : 45;
                  const fontSize = calculateFontSize(node.text, radius);
                  const isSelected = selectedNode && selectedNode.id === node.id;
                  const markColor = markedNodes[node.id];
                  
                  return (
                    <g key={node.id}>
                      <g onClick={(e) => handleNodeClick(e, node.id, node.text)} style={{ cursor: 'pointer', transformOrigin: `${node.x}px ${node.y}px` }}>
                        {markColor && <circle cx={node.x} cy={node.y} r={radius + 3} fill="none" stroke={markColor} strokeWidth="2" opacity="0.5" />}
                        <circle cx={node.x} cy={node.y} r={radius} fill={color} stroke={markColor || 'white'} strokeWidth={markColor ? 5 : isSelected ? 4 : 3} strokeDasharray={node.isCustom ? '6 3' : 'none'} filter="url(#shadow)" />
                        <text x={node.x} y={node.y} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={fontSize} fontWeight="300" pointerEvents="none">{node.text}</text>
                      </g>

                      {sidebarInfo && isSelected && (
                        <g>
                          <rect x={node.x + radius * 0.4} y={node.y + radius * 0.4} width="42" height="16" rx="8" fill={getCategoryColor(sidebarInfo.category)} opacity="0.95" />
                          <text x={node.x + radius * 0.4 + 21} y={node.y + radius * 0.4 + 8} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="9" fontWeight="500" pointerEvents="none">{sidebarInfo.category}</text>
                        </g>
                      )}

                      {isSelected && (
                        <g>
                          <g onClick={(e) => handleQuickExpand(e, node.id, node.text)} style={{ cursor: 'pointer' }}>
                            <circle cx={node.x - radius - 15} cy={node.y} r="12" fill="black" stroke="white" strokeWidth="2" />
                            <text x={node.x - radius - 15} y={node.y} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="16" fontWeight="bold" pointerEvents="none">+</text>
                          </g>
                          <g onClick={(e) => handleQuickAdd(e, node.id)} style={{ cursor: 'pointer' }}>
                            <circle cx={node.x} cy={node.y - radius - 15} r="12" fill="#6B4423" stroke="white" strokeWidth="2" />
                            <text x={node.x} y={node.y - radius - 15} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="12" fontWeight="bold" pointerEvents="none">✎</text>
                          </g>
                          <g onClick={(e) => handleQuickSearch(e, node.text)} style={{ cursor: 'pointer' }}>
                            <circle cx={node.x + radius + 15} cy={node.y} r="12" fill="black" stroke="white" strokeWidth="2" />
                            <text x={node.x + radius + 15} y={node.y + 1} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="12" pointerEvents="none">🔍</text>
                          </g>
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>

            {nodes.length === 0 && !loading && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ textAlign: 'center', color: '#a8a29e' }}>
                  <SparklesIcon size={64} />
                  <p style={{ fontSize: '20px', fontWeight: 300, letterSpacing: '0.05em', marginTop: '16px' }}>在上方输入关键词开始创作</p>
                </div>
              </div>
            )}

            {addingChildTo !== null && (
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: 'white', border: '2px solid black', padding: '28px', zIndex: 20, minWidth: '320px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <p style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#78716c', fontWeight: 300 }}>
                    手动添加联想词
                  </p>
                  <button onClick={() => { setAddingChildTo(null); setCustomInput(''); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}>
                    <XIcon size={18} />
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    autoFocus
                    type="text"
                    value={customInput}
                    onChange={e => setCustomInput(e.target.value)}
                    onKeyPress={e => { if (e.key === 'Enter') handleAddCustomNode(); }}
                    placeholder="输入你的联想词..."
                    style={{ flex: 1, padding: '10px 14px', border: '1px solid #d6d3d1', outline: 'none', fontSize: '15px', fontWeight: 300 }}
                  />
                  <button onClick={handleAddCustomNode} disabled={!customInput.trim()}
                    style={{ padding: '10px 20px', backgroundColor: customInput.trim() ? '#6B4423' : '#d6d3d1', color: 'white', border: 'none', cursor: customInput.trim() ? 'pointer' : 'not-allowed', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '12px', fontWeight: 300, whiteSpace: 'nowrap' }}>
                    添加
                  </button>
                </div>
                <p style={{ marginTop: '10px', fontSize: '11px', color: '#a8a29e', fontWeight: 300 }}>添加后可继续 AI 发散、查找参考图或再次手动添加</p>
              </div>
            )}
          </div>
        </div>

        {sidebarInfo && selectedNode && !isMobile && (
          <div style={{ width: '384px', flexShrink: 0, backgroundColor: 'white', borderLeft: '1px solid #e7e5e4', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <SidebarContent />
          </div>
        )}
      </div>

      {sidebarInfo && selectedNode && isMobile && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', backgroundColor: 'white', borderRadius: '16px 16px 0 0', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <SidebarContent />
          </div>
        </div>
      )}
    </div>
  );
};

ReactDOM.render(<ArtBrainstormTool />, document.getElementById('root'));