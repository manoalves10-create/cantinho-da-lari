async function askGemini(query) {
  if (!state.geminiKey) {
    return 'Para ter respostas com raciocínio e síntese completa de IA, ative a chave gratuita do Gemini na aba "Meu plano e dados".';
  }

  const prompt = `Você é o Tutor de Fitoplâncton no site "Cantinho de Estudos da Lari".
Sua aluna é a Lari, estudante de biologia/oceanografia.
Responda de forma pedagógica, completa, didática e cientificamente correta em português.
Use prioritariamente os artigos abaixo, mas raciocine, sintetize e responda perguntas hipotéticas ou enunciados inventados:

--- BASE DE ARTIGOS ---
${JSON.stringify(state.articles || [], null, 2)}
-----------------------

Dúvida ou questão da Lari: "${query}"`;

  // Lista de modelos suportados para teste em ordem
  const models = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-3-flash-preview'];

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(state.geminiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
      });

      if (res.ok) {
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Não consegui formular uma resposta detalhada. Tente reformular a pergunta.';
      }
    } catch (e) {
      // Tenta o próximo modelo da lista
    }
  }

  return 'Não foi possível conectar aos modelos do Gemini. Verifique se a sua chave de API em "Meu plano e dados" foi copiada por completo do Google AI Studio.';
}
