const sidebar = document.getElementById('sidebar');

document.addEventListener('mousemove', function(e) {
    if (!sidebar) return;
    if (e.clientX <= 20) {
        sidebar.classList.add('active');
    } else if (e.clientX > 220) {
        sidebar.classList.remove('active');
    }
});

document.getElementById('home-link')?.addEventListener('click', function(e) {
    e.preventDefault();
    document.getElementById('home-section').style.display = 'block';
});

function generatePassword(length) {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    const digits = "0123456789";
    const symbols = "#@!$%&*?";
    const allChars = letters + digits + symbols;

    let password = digits.charAt(Math.floor(Math.random() * digits.length));
    for (let i = 1; i < length; i++) {
        password += allChars.charAt(Math.floor(Math.random() * allChars.length));
    }
    password = password.split('').sort(() => 0.5 - Math.random()).join('');
    return password;
    
}

/* ---------- math utilities ---------- */

/* validate arithmetic expression (allows digits, operators, parentheses, spaces, decimal point, ^ and % ) */
function isSafeArithmetic(expr) {
    return /^[0-9+\-*/%().\s^]+$/.test(expr);
}

/* step-by-step evaluator for arithmetic expressions:
   - handles parentheses by resolving innermost first and recording steps
   - supports modulus (%) and ^ (converted to **) and uses safe eval only after validation
*/
function arithmeticSteps(expression) {
    let expr = expression.replace(/\s+/g, '').replace(/\^/g, '**');
    if (!isSafeArithmetic(expression)) return { error: 'Expression contains invalid characters.' };
    const steps = [];

    // helper to eval a small numeric expression safely
    const safeEval = (e) => {
        // final safety: allow only digits, operators, parentheses, ., %, and **
        // temporarily collapse ** to a single * for the regex test
        const testStr = e.replace(/\*\*/g, '*');
        if (!/^[0-9+\-*/%().\s]+$/.test(testStr)) {
            throw new Error('Unsafe eval attempt');
        }
        // eslint-disable-next-line no-new-func
        return Function('"use strict"; return (' + e + ')')();
    };

    // resolve parentheses
    const parenRE = /\([^()]*\)/;
    while (parenRE.test(expr)) {
        const match = expr.match(parenRE)[0]; // includes parentheses
        const inner = match.slice(1, -1);
        let val;
        try { val = safeEval(inner); }
        catch (err) { return { error: 'Could not evaluate subexpression: ' + inner }; }
        steps.push(`Evaluate ${match} = ${val}`);
        expr = expr.replace(match, String(val));
    }

    // final evaluation with one step showing final result
    let final;
    try { final = safeEval(expr); }
    catch (err) { return { error: 'Could not evaluate expression.' }; }
    steps.push(`Evaluate ${expr} = ${final}`);
    return { steps, result: final };
}

/* solve simple linear ax + b = c and provide steps */
function linearSteps(equation) {
    const parsed = parseSimpleLinear(equation);
    if (!parsed) return null;
    const { a, b, c, variable } = parsed;
    const steps = [];
    steps.push(`Equation: ${a}${variable} ${b >= 0 ? '+'+b : b} = ${c}`);
    steps.push(`Step 1: Subtract ${b} from both sides: ${a}${variable} = ${c - b}`);
    const rhs = c - b;
    steps.push(`Step 2: Divide both sides by ${a}: ${variable} = ${rhs} / ${a}`);
    const solution = rhs / a;
    steps.push(`Result: ${variable} = ${solution}`);
    return { steps, result: solution };
}

/* ---------- advanced solver ---------- */

/*
  solveEquation(equationString)
  - tries linear and quadratic symbolic solving with steps
  - if not matched, simplifies expression and performs numeric root-finding
  returns { steps: string[], result: string }
*/
function solveEquation(equation) {
    const s = (equation || '').trim();

    // percent / price-change detection (natural language)
    if (/(percent|%|drop|dropped|decrease|decreased|increase|increased|price|now|was|from|to)/i.test(s)) {
        const pct = percentChangeSteps(s);
        if (pct) return pct;
        // fall through if percent parser couldn't extract numbers
    }

    // if it's a pure arithmetic expression (no '=' and contains digits and arithmetic operators), handle it
    if (!s.includes('=') && /^[0-9+\-*/%^().\s]+$/.test(s)) {
        const ar = arithmeticSteps(s);
        if (ar.error) return { steps: [ar.error], result: null };
        return { steps: ar.steps, result: ar.result };
    }

    // existing routing for inequalities, quadratics, exponents (keep as before)
    const compact = s.replace(/\s+/g, '');
    if (/[<>]=?|>=|<=/.test(compact) && /x/i.test(compact)) {
        return solveQuadraticInequality(equation);
    }
    if (/[xX](\^2|\*\*2)/.test(equation) || /x\^2/i.test(equation) || /x\*\*2/i.test(equation)) {
        return solveQuadratic(equation);
    }
    if (!equation.includes('=') && /(\^|\*\*)/.test(equation)) {
        return solveExponents(equation);
    }
    return { steps: ['Only Quadratic Equations, Exponents, Quadratic Inequalities, basic arithmetic, and percent-change sentences are supported by this solver.'], result: null };
}

/* ---------- replace advanced solver with limited solver for:
     - Quadratic Equations (ax^2+bx+c=0)
     - Exponents (expressions with ^)
     - Quadratic Inequalities (ax^2+bx+c < 0, <=, >, >=)
*/

/* parse quadratic coefficients from expression string (left side only expected) */
function parseQuadraticCoeffs(expr) {
    try {
        // move to simplified form
        const node = math.simplify(expr.replace(/\^/g, '**'));
        const s = node.toString().replace(/\s+/g, '');
        // normalize to use ** for easier regex
        const norm = s.replace(/\*\*/g, '^');
        // find a (x^2), b (x), c (constant)
        let a = 0, b = 0, c = 0;
        // match terms like +2*x^2, -x^2, +3*x, -x, +5
        const terms = norm.replace(/-/g, '+-').split('+').map(t => t.trim()).filter(Boolean);
        for (const t of terms) {
            if (/[xX]\^2/.test(t)) {
                const coef = t.replace(/[xX]\^2/, '') || '1';
                a += parseFloat(coef.replace(/\*$/,'')) || parseFloat(coef.replace('*','')) || 1 * (coef.startsWith('-') ? -1 : 1);
            } else if (/[xX](?!\^)/.test(t)) {
                const coef = t.replace(/[xX]/, '') || '1';
                b += parseFloat(coef.replace(/\*$/,'')) || parseFloat(coef.replace('*','')) || 1 * (coef.startsWith('-') ? -1 : 1);
            } else {
                c += parseFloat(t) || 0;
            }
        }
        if (a === 0 && b === 0 && c === 0) return null;
        return { a, b, c };
    } catch (err) {
        return null;
    }
}

/* Solve quadratic equation step-by-step */
function solveQuadratic(equation) {
    const steps = [];
    // expect form something = something
    if (!equation.includes('=')) return { steps: ['Equation must contain "=".'], result: null };
    const parts = equation.split('=');
    const left = parts[0];
    const right = parts.slice(1).join('=');
    steps.push(`Rewrite: bring all terms to one side → (${left}) - (${right}) = 0`);
    const combined = `(${left})-(${right})`;
    // simplify
    let simp;
    try {
        simp = math.simplify(combined).toString();
        steps.push(`Simplified to: ${simp}`);
    } catch (err) {
        simp = combined;
        steps.push(`Could not fully simplify, using: ${simp}`);
    }
    const coeffs = parseQuadraticCoeffs(simp);
    if (!coeffs || coeffs.a === 0) return { steps: ['Not a quadratic equation (a = 0) or could not parse coefficients.'], result: null };
    const { a, b, c } = coeffs;
    steps.push(`Identified coefficients: a = ${a}, b = ${b}, c = ${c}`);
    const D = b*b - 4*a*c;
    steps.push(`Compute discriminant: D = b² - 4ac = ${b}² - 4·${a}·${c} = ${D}`);
    if (D < 0) {
        steps.push('Discriminant < 0 → two complex roots.');
        const r1 = math.format(math.divide(math.add(-b, math.sqrt(math.complex(D))), 2*a));
        const r2 = math.format(math.divide(math.subtract(-b, math.sqrt(math.complex(D))), 2*a));
        steps.push(`Roots: (-b ± √D) / (2a) → ${r1}, ${r2}`);
        return { steps, result: `${r1}, ${r2}` };
    } else {
        const sqrtD = Math.sqrt(D);
        steps.push(`√D = ${sqrtD}`);
        const r1 = (-b + sqrtD) / (2*a);
        const r2 = (-b - sqrtD) / (2*a);
        steps.push(`Roots: (-b ± √D) / (2a) → (${ -b } ± ${sqrtD}) / ${2*a} => ${r1}, ${r2}`);
        return { steps, result: `${r1}, ${r2}` };
    }
}

/* Solve exponent expressions: simplify then evaluate if numeric */
function solveExponents(expr) {
    const steps = [];
    const original = expr.trim();
    steps.push(`Original: ${original}`);
    try {
        // simplify symbolic (math.js handles exponent rules)
        const simplified = math.simplify(original.replace(/\^/g, '**')).toString();
        steps.push(`Simplified (symbolic): ${simplified}`);
        // try numeric evaluation
        const numeric = math.evaluate(simplified);
        if (typeof numeric === 'number' || math.typeOf(numeric) === 'Complex') {
            steps.push(`Evaluated result: ${numeric.toString()}`);
            return { steps, result: numeric.toString() };
        } else {
            steps.push('Expression simplified but not a single numeric result.');
            return { steps, result: simplified.toString() };
        }
    } catch (err) {
        return { steps: ['Could not parse or simplify exponent expression.'], result: null };
    }
}

/* Solve quadratic inequalities like ax^2+bx+c < 0 (supports <, <=, >, >=) */
function solveQuadraticInequality(equation) {
    const steps = [];
    // detect operator
    const m = equation.match(/(<=|>=|<|>)/);
    if (!m) return { steps: ['Inequality sign not found (<, <=, >, >=).'], result: null };
    const op = m[0];
    const parts = equation.split(op);
    if (parts.length !== 2) return { steps: ['Invalid inequality format.'], result: null };
    const left = parts[0], right = parts[1];
    steps.push(`Rewrite: bring all terms to one side → (${left}) - (${right}) ${op} 0`);
    const combined = `(${left})-(${right})`;
    let simp;
    try {
        simp = math.simplify(combined).toString();
        steps.push(`Simplified to: ${simp}`);
    } catch (err) {
        simp = combined;
        steps.push(`Could not fully simplify, using: ${simp}`);
    }
    const coeffs = parseQuadraticCoeffs(simp);
    if (!coeffs || coeffs.a === 0) return { steps: ['Not a quadratic inequality (a = 0) or could not parse coefficients.'], result: null };
    const { a, b, c } = coeffs;
    steps.push(`Identified coefficients: a = ${a}, b = ${b}, c = ${c}`);
    const D = b*b - 4*a*c;
    steps.push(`Compute discriminant: D = ${D}`);
    if (D < 0) {
        steps.push('Discriminant < 0 → quadratic has no real roots.');
        // Determine sign of quadratic (sign of a)
        if ((op === '<' || op === '<=') && a < 0) {
            steps.push('Since a < 0, quadratic always negative → inequality holds for all real x.');
            return { steps, result: 'All real numbers' };
        } else if ((op === '>' || op === '>=') && a > 0) {
            steps.push('Since a > 0, quadratic always positive → inequality holds for all real x.');
            return { steps, result: 'All real numbers' };
        } else {
            steps.push('Inequality does not hold for any real x.');
            return { steps, result: 'No solution' };
        }
    } else {
        const r1 = (-b - Math.sqrt(D)) / (2*a);
        const r2 = (-b + Math.sqrt(D)) / (2*a);
        const leftRoot = Math.min(r1, r2), rightRoot = Math.max(r1, r2);
        steps.push(`Real roots: ${leftRoot}, ${rightRoot}`);
        steps.push('Test intervals determined by the roots: (-∞, leftRoot), (leftRoot, rightRoot), (rightRoot, ∞)');
        // Determine sign on intervals: quadratic has sign of a outside roots
        let solution;
        if (op === '<') {
            if (a > 0) solution = `(${leftRoot}, ${rightRoot})`;
            else solution = `(-∞, ${leftRoot}) ∪ (${rightRoot}, ∞)`;
        } else if (op === '<=') {
            if (a > 0) solution = `[${leftRoot}, ${rightRoot}]`;
            else solution = `(-∞, ${leftRoot}] ∪ [${rightRoot}, ∞)`;
        } else if (op === '>') {
            if (a > 0) solution = `(-∞, ${leftRoot}) ∪ (${rightRoot}, ∞)`;
            else solution = `(${leftRoot}, ${rightRoot})`;
        } else if (op === '>=') {
            if (a > 0) solution = `(-∞, ${leftRoot}] ∪ [${rightRoot}, ∞)`;
            else solution = `[${leftRoot}, ${rightRoot}]`;
        }
        steps.push(`Solution based on sign of a (${a}) and operator ${op}: ${solution}`);
        return { steps, result: solution };
    }
}

/* numeric root finder: samples f(x) on range and uses bisection on sign changes */
function numericRootsFromFunction(node) {
    const f = (x) => {
        try {
            return Number(math.evaluate(node, { x }));
        } catch (err) {
            return NaN;
        }
    };
    const roots = [];
    const min = -200, max = 200, steps = 400; // grid
    const dx = (max - min) / steps;
    let x0 = min, f0 = f(x0);
    for (let i=1;i<=steps;i++) {
        const x1 = min + i*dx;
        const f1 = f(x1);
        if (!Number.isFinite(f0) || !Number.isFinite(f1)) { x0 = x1; f0 = f1; continue; }
        if (f0 === 0) {
            if (!roots.includes(x0)) roots.push(x0);
        }
        if (f0 * f1 < 0) {
            // bisection
            let a = x0, b = x1, fa = f0, fb = f1, mid, fm;
            for (let k=0;k<50;k++) {
                mid = (a+b)/2;
                fm = f(mid);
                if (!Number.isFinite(fm)) break;
                if (Math.abs(fm) < 1e-8) break;
                if (fa * fm < 0) { b = mid; fb = fm; } else { a = mid; fa = fm; }
            }
            const root = roundNumber(mid, 8);
            if (!roots.some(r => Math.abs(r - root) < 1e-6)) roots.push(root);
        }
        x0 = x1; f0 = f1;
    }
    return roots;
}

function roundNumber(n, prec=6) {
    return Math.round(n * Math.pow(10, prec)) / Math.pow(10, prec);
}

/* ---------- DOM logic (without OCR/image code) ---------- */
document.addEventListener('DOMContentLoaded', function() {
    // password bot elements
    const aiResponse = document.getElementById('ai-response');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');

    // math bot elements (existing)
    const mathResponse = document.getElementById('math-response');
    const mathInput = document.getElementById('math-input');
    const mathSend = document.getElementById('math-send');
    const mathStepsBox = document.getElementById('math-steps');

    /* password handling (existing) */
    let lastValue = "";
    function handlePasswordRequest() {
        const value = userInput.value.trim();
        if (value === "" || value === lastValue) return;
        lastValue = value;
        const length = parseInt(value, 10);
        if (!isNaN(length) && length >= 4 && length <= 100) {
            const password = generatePassword(length);
            aiResponse.textContent = 'Your safe password is: ' + password;
        } else {
            aiResponse.textContent = 'Please enter a number between 4 and 100.';
        }
        setTimeout(() => { lastValue = ""; }, 300);
    }
    sendBtn.addEventListener('click', handlePasswordRequest);
    userInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handlePasswordRequest();
        }
    });

    /* math handling (modified to toggle/reset on repeated Enter) */
    let lastMathExpr = null;
    let mathShowing = false;

    function showMathSteps(lines) {
        if (!mathStepsBox) return;
        mathStepsBox.innerHTML = '';
        lines.forEach(line => {
            const div = document.createElement('div');
            div.textContent = line;
            mathStepsBox.appendChild(div);
        });
        mathStepsBox.classList.add('active'); // make box visible
    }

    function clearMathSteps() {
        if (!mathStepsBox) return;
        mathStepsBox.innerHTML = '';
        mathStepsBox.classList.remove('active'); // hide box when empty
    }

    function handleMath() {
        const expr = mathInput.value.trim();
        if (!expr) return;

        // If same expression and currently showing result -> reset to default
        if (lastMathExpr === expr && mathShowing) {
            mathResponse.textContent = 'Math bot ready — enter expression';
            clearMathSteps();
            mathShowing = false;
            return;
        }

        clearMathSteps();
        const solved = solveEquation(expr);
        if (solved && solved.steps && solved.steps.length) {
            mathResponse.textContent = `Result: ${solved.result}`;
            showMathSteps(solved.steps);
            lastMathExpr = expr;
            mathShowing = true;
        } else {
            mathResponse.textContent = 'Could not solve the expression.';
            lastMathExpr = null;
            mathShowing = false;
        }
    }

    function resetMathDisplay() {
        mathResponse.textContent = 'Math bot ready — enter expression';
        clearMathSteps();
        mathShowing = false;
        lastMathExpr = null;
    }

    mathSend.addEventListener('click', handleMath);

    mathInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (mathShowing) {
                resetMathDisplay();
                return;
            }
            handleMath();
        }
    });
});

/* ---------- helper: extract one numeric expression from OCR/text ---------- */
function extractFirstNumericExpression(text) {
    if (!text) return null;
    // Normalize newlines and common OCR garbage
    const cleanedText = text.replace(/[\u00A0\u200B]+/g, ' ').replace(/[,]/g, '.');
    // Find contiguous sequences that contain digits and allowed operators
    const matches = cleanedText.match(/[0-9+\-*/^().=\s]+/g);
    if (!matches) return null;
    // Choose first match that actually contains a digit
    for (let m of matches) {
        if (/\d/.test(m)) {
            // Remove any stray characters not in allowed set (keep = if present)
            let expr = m.replace(/[^0-9+\-*/^().=\s]/g, '');
            // Trim and collapse spaces
            expr = expr.replace(/\s+/g, ' ').trim();
            if (expr.length === 0) continue;
            // If expression contains multiple separate equations on same line, split and take first
            if (expr.includes(';')) expr = expr.split(';')[0].trim();
            // If there are multiple '=' signs, keep up to the second part only (first equation)
            const eqCount = (expr.match(/=/g) || []).length;
            if (eqCount > 1) {
                // take substring up to second '=' occurrence's right side end (best-effort): stop at second '='
                const firstEqIndex = expr.indexOf('=');
                const rest = expr.slice(firstEqIndex + 1);
                // keep first right-hand part until next non-allowed char or end
                const secondEqIndex = rest.indexOf('=');
                if (secondEqIndex !== -1) {
                    expr = expr.slice(0, firstEqIndex + 1 + secondEqIndex).trim();
                } else {
                    expr = expr.split('=')[0].trim(); // fallback: take left side only
                }
            }
            // Final simple check: contains digit and allowed chars
            if (/[0-9]/.test(expr)) return expr;
        }
    }
    return null;
}

/* ---------- rational-equation solver (step-by-step) ---------- */
function rationalSteps(equation) {
    const steps = [];
    // normalize
    let eq = equation.replace(/\s+/g, '').replace(/\^/g, '**');

    if (!eq.includes('=')) return null;
    const parts = eq.split('=');
    const left = parts[0];
    const right = parts.slice(1).join('=');

    // find denominators (best-effort): look for "/" followed by (...) or token
    const denomRegex = /\/\s*(\([^)]+\)|[A-Za-z0-9+\-^]+)/g;
    const denoms = [];
    let m;
    while ((m = denomRegex.exec(left)) !== null) denoms.push(m[1]);
    while ((m = denomRegex.exec(right)) !== null) denoms.push(m[1]);
    if (denoms.length === 0) return null; // not a rational equation

    // normalize denominators (remove outer parentheses if they exactly enclose)
    const cleanedDenoms = Array.from(new Set(denoms.map(d => {
        let s = d.trim();
        if (s.startsWith('(') && s.endsWith(')')) s = s.slice(1, -1);
        return s;
    })));

    const commonDen = cleanedDenoms.map(d => `(${d})`).join('*');
    steps.push(`Common denominator: ${commonDen}`);

    // compute excluded values (roots of each denominator)
    const excluded = [];
    for (const d of cleanedDenoms) {
        try {
            const node = math.parse(d);
            const roots = numericRootsFromFunction(node);
            roots.forEach(r => {
                if (!excluded.some(e => Math.abs(e - r) < 1e-8)) excluded.push(r);
            });
        } catch (err) { /* ignore */ }
    }
    if (excluded.length) {
        steps.push(`Excluded values (cannot be roots): ${excluded.join(', ')}`);
    }

    // Multiply both sides by common denominator and simplify
    const exprBoth = `(${left})-(${right})`; // f(x) = 0 form
    steps.push(`Rewrite as f(x)= (${left}) - (${right})`);
    const multipliedStr = `(${exprBoth})*(${commonDen})`;
    let simplified;
    try {
        const node = math.parse(multipliedStr);
        simplified = math.simplify(node).toString();
    } catch (err) {
        simplified = multipliedStr;
    }
    steps.push(`Multiply both sides by common denominator and simplify: ${simplified}`);

    // Try to get polynomial and numeric roots
    let roots = [];
    try {
        const polyNode = math.parse(simplified);
        roots = numericRootsFromFunction(polyNode);
    } catch (err) { roots = []; }

    if (!roots || roots.length === 0) {
        steps.push('No numeric roots found after clearing denominators (or roots are complex).');
        return { steps, result: 'No real solution found' };
    }

    steps.push(`Solve polynomial: found roots ${roots.join(', ')}`);

    // filter out excluded values
    const realRoots = roots.filter(r => !excluded.some(e => Math.abs(e - r) < 1e-6));
    if (realRoots.length === 0) {
        steps.push('All found roots are excluded because they make a denominator zero. No valid solutions.');
        return { steps, result: 'No valid solution (excluded by domain)' };
    }

    steps.push(`Valid solutions after excluding forbidden values: ${realRoots.join(', ')}`);
    return { steps, result: realRoots.join(', ') };
}

/* ---------- percent-change helper: detect two numbers and compute percent change ---------- */
function extractNumbersWithIndices(text) {
    if (!text) return [];
    const re = /[+-]?\d[\d,]*(?:\.\d+)?/g;
    const results = [];
    let m;
    while ((m = re.exec(text)) !== null) {
        const raw = m[0];
        const val = parseFloat(raw.replace(/,/g, ''));
        if (!Number.isNaN(val)) results.push({ value: val, index: m.index, raw });
    }
    return results;
}

function extractNumbersFromText(text) {
    return extractNumbersWithIndices(text).map(o => o.value);
}

function percentChangeSteps(text) {
    const steps = [];
    const items = extractNumbersWithIndices(text);
    if (items.length < 2) return null;

    const lower = (text || '').toLowerCase();

    const oldKeywords = ['was','originally','from','before','previously','old','priced at'];
    const newKeywords = ['now','current','today','to','now is','is now','price now','now,'];

    let oldIdx = null, newIdx = null;

    // detect by nearby keywords
    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const start = Math.max(0, it.index - 30);
        const end = Math.min(lower.length, it.index + 30);
        const ctx = lower.slice(start, end);
        if (oldIdx === null && oldKeywords.some(k => ctx.includes(k))) oldIdx = i;
        if (newIdx === null && newKeywords.some(k => ctx.includes(k))) newIdx = i;
    }

    // special handling for "from X to Y"
    const fromMatch = lower.match(/from\s+([0-9\.,]+)/);
    const toMatch = lower.match(/to\s+([0-9\.,]+)/);
    if (fromMatch && toMatch) {
        // try to match positions to items
        const fromPos = lower.indexOf(fromMatch[0]);
        const toPos = lower.indexOf(toMatch[0]);
        const fromItem = items.findIndex(it => it.index >= fromPos && it.index < fromPos + fromMatch[0].length + 40);
        const toItem = items.findIndex(it => it.index >= toPos && it.index < toPos + toMatch[0].length + 40);
        if (fromItem !== -1) oldIdx = fromItem;
        if (toItem !== -1) newIdx = toItem;
    }

    // default assignment if detection failed
    if (oldIdx === null && newIdx === null) {
        oldIdx = 0;
        newIdx = 1;
    } else if (oldIdx === null && newIdx !== null) {
        // pick a different index as old (prefer earlier number)
        oldIdx = (newIdx === 0) ? 1 : 0;
    } else if (newIdx === null && oldIdx !== null) {
        newIdx = (oldIdx === 0) ? 1 : 0;
    }

    // ensure distinct indices
    if (oldIdx === newIdx) {
        if (items.length >= 2) { oldIdx = 0; newIdx = 1; }
        else return null;
    }

    const oldVal = items[oldIdx].value;
    const newVal = items[newIdx].value;
    if (oldVal === 0) return null;

    const change = newVal - oldVal;
    const percent = (change / oldVal) * 100;

    steps.push(`Original value (old) = ${oldVal}`);
    steps.push(`New value = ${newVal}`);
    steps.push(`Change = new - old = ${newVal} - ${oldVal} = ${change}`);
    steps.push(`Percent change = (Change / Original) × 100 = (${change} / ${oldVal}) × 100 = ${percent.toFixed(6)}%`);

    const direction = (change > 0) ? 'increase' : (change < 0) ? 'decrease' : 'no change';
    const resultText = `${Math.abs(percent).toFixed(6)}% ${direction}`;

    return { steps, result: resultText };
}