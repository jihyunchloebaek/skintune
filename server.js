const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const multer = require('multer');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 추천 API (설문 + 사진)
app.post('/api/recommend', upload.single('photo'), async (req, res) => {
  const answers = JSON.parse(req.body.answers || '{}');
  const hasPhoto = !!req.file;

  const skinLabels = {
    skinType: { dry: '건성', oily: '지성', combination: '복합성', normal: '중성' },
    trouble: { acne_prone: '여드름성', occasional: '간헐적 트러블', sensitive: '민감성', clear: '트러블 없음' },
    concern: { pores: '모공/블랙헤드', aging: '주름/탄력', brightening: '미백/톤업', hydration: '수분/보습' },
    texture: { light: '가벼운 워터/젤', medium: '로션', rich: '진한 크림', any: '무관' },
    budget: { budget: '1~3만원대', mid: '3~7만원대', premium: '7만원 이상', value: '가격무관/효과중심' }
  };

  const keys = ['skinType', 'trouble', 'concern', 'texture', 'budget'];
  const labels = ['피부타입', '트러블', '피부고민', '선호텍스처', '예산'];
  const summary = keys.map((k, i) => `- ${labels[i]}: ${skinLabels[k][answers[k]] || '미응답'}`).join('\n');

  const prompt = `당신은 피부 전문 뷰티 컨설턴트입니다.${hasPhoto ? ' 첨부된 피부 사진도 함께 분석해주세요.' : ''}

[고객 피부 설문 정보]
${summary}

아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력하세요:
{
  "skin_summary": "피부 타입 한줄 요약",
  ${hasPhoto ? '"photo_analysis": "사진에서 관찰된 피부 상태 1-2문장",' : ''}
  "skin_type_label": "피부타입 짧은 라벨 (예: 건성 민감성)",
  "morning_routine": [
    {"step": 1, "category": "카테고리", "product_type": "제품 유형", "tip": "사용 팁"}
  ],
  "evening_routine": [
    {"step": 1, "category": "카테고리", "product_type": "제품 유형", "tip": "사용 팁"}
  ],
  "brands": [
    {
      "name": "브랜드명",
      "price_range": "가격대",
      "reason": "추천 이유 2문장",
      "key_products": [
        {"name": "제품명", "coupang_search": "쿠팡 검색어", "oliveyoung_search": "올리브영 검색어"}
      ]
    }
  ],
  "ingredient_tips": [
    {"ingredient": "성분명", "benefit": "효능", "avoid_with": "함께 쓰면 안 되는 성분"}
  ]
}

브랜드 3개, morning/evening 루틴 각 4-5단계, ingredient_tips 3개 작성해주세요.`;

  try {
    const messages = hasPhoto
      ? [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: req.file.mimetype, data: req.file.buffer.toString('base64') } },
            { type: 'text', text: prompt }
          ]
        }]
      : [{ role: 'user', content: prompt }];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, messages })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message || '오류 발생' });
    }

    const data = await response.json();
    const text = data.content[0].text.trim().replace(/```json|```/g, '').trim();
    res.json({ result: JSON.parse(text) });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SKINTUNE server running on port ${PORT}`));
