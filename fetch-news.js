// ============================================================
//  DG Academy — Buscador automático de notícias
//  Executa diariamente via GitHub Actions às 8h (BRT)
//  Requer: ANTHROPIC_API_KEY como variável de ambiente
// ============================================================

const https = require('https');
const fs   = require('fs');

const API_KEY = process.env.ANTHROPIC_API_KEY;
if(!API_KEY){
  console.error('❌ ANTHROPIC_API_KEY não encontrada. Configure o Secret no GitHub.');
  process.exit(1);
}

const hoje = new Date().toLocaleDateString('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric'
});

const prompt = `Você é um assistente especializado em tributação brasileira.

Busque as últimas notícias, comunicados e atos normativos da Receita Federal do Brasil publicados hoje (${hoje}) ou nos últimos 3 dias. Pesquise em:
- gov.br/receitafederal/pt-br/noticias
- Diário Oficial da União (DOU) seção Fazenda
- Atos normativos e instruções normativas recentes

Para cada notícia, crie um resumo claro e didático em linguagem acessível para contadores.

RETORNE APENAS JSON VÁLIDO, sem texto antes ou depois, sem blocos de código markdown:

{"noticias":[{"titulo":"título completo e fiel da notícia","resumo":"Parágrafo 1: o que foi publicado e qual é o tema central da notícia.\\n\\nParágrafo 2: impacto prático para contadores, empresas e contribuintes — o que muda na rotina.\\n\\nParágrafo 3: prazos importantes, obrigações geradas ou próximos passos que o contador deve tomar.","data":"${hoje}","categoria":"Imposto de Renda","fonte_url":"https://url-da-noticia-original"}]}

Categorias possíveis: Imposto de Renda, CNPJ, Simples Nacional, Nota Fiscal, Geral

Busque no mínimo 5 notícias. Priorize assuntos com impacto prático direto para contadores.`;

function chamarAPI(){
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }]
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if(parsed.error) return reject(new Error(parsed.error.message));
          resolve(parsed);
        } catch(e){ reject(e); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main(){
  console.log(`🔍 Buscando notícias da Receita Federal — ${hoje}`);

  try {
    const resposta = await chamarAPI();

    let texto = '';
    for(const bloco of (resposta.content || [])){
      if(bloco.type === 'text') texto += bloco.text;
    }

    // Limpa possíveis blocos markdown
    texto = texto.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    const inicio = texto.indexOf('{');
    const fim    = texto.lastIndexOf('}');
    if(inicio === -1 || fim === -1) throw new Error('JSON não encontrado na resposta da API');

    const json = JSON.parse(texto.slice(inicio, fim + 1));
    if(!json.noticias || json.noticias.length === 0) throw new Error('Nenhuma notícia retornada');

    // Adiciona metadados
    json.atualizado_em  = new Date().toISOString();
    json.data_exibicao  = hoje;
    json.total          = json.noticias.length;

    fs.writeFileSync('news.json', JSON.stringify(json, null, 2), 'utf8');

    console.log(`✅ ${json.noticias.length} notícias salvas em news.json`);
    json.noticias.forEach((n, i) => console.log(`   ${i+1}. [${n.categoria}] ${n.titulo}`));

  } catch(err){
    console.error('❌ Erro ao buscar notícias:', err.message);

    // Salva arquivo de erro para o blog exibir mensagem amigável
    fs.writeFileSync('news.json', JSON.stringify({
      noticias: [],
      atualizado_em: new Date().toISOString(),
      data_exibicao: hoje,
      total: 0,
      erro: err.message
    }, null, 2), 'utf8');

    process.exit(1);
  }
}

main();
