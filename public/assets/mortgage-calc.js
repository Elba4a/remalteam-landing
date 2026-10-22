// Generic fixed-instalment estimate for /mortgage-calculator/. Runs in the browser only; nothing is sent anywhere.
(() => {
  const form = document.getElementById('calc');
  const wa = document.getElementById('calc-wa');
  const waBase = document.querySelector('.site-head .btn').href.split('?')[0]; // office number comes from the built header
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  // Clamped to the input's own min/max (the form is novalidate, so the browser won't).
  const num = (name) => {
    const el = form.elements[name], v = parseFloat(el.value);
    return v > 0 ? Math.min(+el.max || Infinity, Math.max(+el.min || 0, v)) : 0; // empty/negative stays 0 → "—"
  };

  const update = () => {
    const salary = num('salary'), debts = num('debts'), share = num('share'), years = num('years'), rate = num('rate');
    const payment = salary * share / 100 - debts;
    const n = years * 12, r = rate / 1200;
    // Present value of n equal monthly payments.
    const amount = payment > 0 && n > 0 ? (r ? payment * (1 - (1 + r) ** -n) / r : payment * n) : 0;
    form.elements.payment.value = payment > 0 ? `${fmt(payment)} ريال` : debts > 0 ? 'الالتزامات تتجاوز النسبة' : '—';
    form.elements.amount.value = amount > 0 ? `${fmt(amount)} ريال` : '—';
    wa.href = `${waBase}?text=` + encodeURIComponent(
      `السلام عليكم، استخدمت حاسبة التمويل في موقعكم:\nالراتب: ${fmt(salary)}\nجهة العمل: \nالالتزامات: ${fmt(debts)}\nالمدة: ${years} سنة\nالنسبة: ${rate}٪\nالقسط التقريبي: ${payment > 0 ? fmt(payment) : 0}\nالتمويل التقريبي: ${fmt(amount)}\nأبغى أفضل حسبة مع مقارنة البنوك.`);
  };
  form.addEventListener('input', update);
  form.addEventListener('submit', (e) => e.preventDefault());
  update();
})();
