// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  Widget Calculatrice Scientifique (Version Finale & Testée)                ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

(function() {
    if (document.getElementById('abdCalculator')) return;
    if (window.location.pathname.endsWith('login.html') || window.location.pathname.endsWith('register.html')) return;

    const style = document.createElement('style');
    style.innerHTML = `
        .abd-calc { position: fixed; bottom: 20px; right: 20px; z-index: 99999; font-family: sans-serif; }
        .abd-fab { width: 60px; height: 60px; border-radius: 30px; background: #4f46e5; color: white; border: none; cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; }
        .abd-panel { position: absolute; bottom: 75px; right: 0; width: 300px; background: #0f172a; border: 1px solid #334155; border-radius: 20px; padding: 15px; display: none; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .abd-panel.show { display: block; }
        .abd-screen { background: #020617; padding: 15px; border-radius: 12px; text-align: right; margin-bottom: 15px; border: 1px solid #1e293b; }
        .abd-expr { color: #64748b; font-size: 12px; height: 18px; margin-bottom: 5px; }
        .abd-res { color: white; font-size: 24px; font-weight: bold; }
        .abd-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .abd-btn { background: #1e293b; border: 1px solid #334155; color: white; padding: 12px; border-radius: 10px; cursor: pointer; font-weight: bold; font-size: 14px; }
        .abd-btn:hover { background: #334155; }
        .abd-btn:active { transform: translateY(2px); }
        .abd-btn.op { background: #312e81; color: #a5b4fc; }
        .abd-btn.sci { background: #064e3b; color: #6ee7b7; font-size: 11px; }
        .abd-btn.eq { background: #10b981; grid-column: span 2; }
        .abd-btn.clr { background: #7f1d1d; color: #fca5a5; }
    `;
    document.head.appendChild(style);

    const calc = document.createElement('div');
    calc.id = 'abdCalculator';
    calc.className = 'abd-calc';
    calc.innerHTML = `
        <div class="abd-panel" id="abdPanel">
            <div class="abd-screen">
                <div class="abd-expr" id="abdExpr"></div>
                <div class="abd-res" id="abdRes">0</div>
            </div>
            <div class="abd-grid">
                <button class="abd-btn sci" data-val="Math.sin(">sin</button>
                <button class="abd-btn sci" data-val="Math.cos(">cos</button>
                <button class="abd-btn sci" data-val="Math.sqrt(">√</button>
                <button class="abd-btn op" data-val="/">÷</button>
                
                <button class="abd-btn" data-val="7">7</button>
                <button class="abd-btn" data-val="8">8</button>
                <button class="abd-btn" data-val="9">9</button>
                <button class="abd-btn op" data-val="*">×</button>
                
                <button class="abd-btn" data-val="4">4</button>
                <button class="abd-btn" data-val="5">5</button>
                <button class="abd-btn" data-val="6">6</button>
                <button class="abd-btn op" data-val="-">−</button>
                
                <button class="abd-btn" data-val="1">1</button>
                <button class="abd-btn" data-val="2">2</button>
                <button class="abd-btn" data-val="3">3</button>
                <button class="abd-btn op" data-val="+">+</button>
                
                <button class="abd-btn" data-val="0">0</button>
                <button class="abd-btn" data-val=".">.</button>
                <button class="abd-btn clr" id="abdC">C</button>
                <button class="abd-btn clr" id="abdDel">DEL</button>

                <button class="abd-btn sci" data-val="(">(</button>
                <button class="abd-btn sci" data-val=")">)</button>
                <button class="abd-btn eq" id="abdEq">=</button>
            </div>
        </div>
        <button class="abd-fab" id="abdFab">
            <svg style="width:24px;height:24px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
        </button>
    `;
    document.body.appendChild(calc);

    const panel = document.getElementById('abdPanel');
    const fab = document.getElementById('abdFab');
    const exprDiv = document.getElementById('abdExpr');
    const resDiv = document.getElementById('abdRes');
    
    let currentExpr = '';
    let displayExpr = '';

    fab.addEventListener('click', () => panel.classList.toggle('show'));

    calc.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn || btn.id === 'abdFab') return;

        const val = btn.getAttribute('data-val');
        
        if (val) {
            currentExpr += val;
            displayExpr += btn.innerText;
            exprDiv.innerText = displayExpr;
        } else if (btn.id === 'abdC') {
            currentExpr = ''; displayExpr = ''; exprDiv.innerText = ''; resDiv.innerText = '0';
        } else if (btn.id === 'abdDel') {
            currentExpr = currentExpr.slice(0, -1);
            displayExpr = displayExpr.slice(0, -1);
            exprDiv.innerText = displayExpr;
        } else if (btn.id === 'abdEq') {
            try {
                if (!currentExpr) return;
                // Fermer parenthèses
                let open = (currentExpr.match(/\(/g) || []).length;
                let close = (currentExpr.match(/\)/g) || []).length;
                while(open > close) { currentExpr += ')'; open--; }
                
                const result = eval(currentExpr);
                resDiv.innerText = Math.round(result * 1000) / 1000;
                currentExpr = String(result);
                displayExpr = String(result);
            } catch (err) {
                resDiv.innerText = 'Error';
            }
        }
    });
})();
