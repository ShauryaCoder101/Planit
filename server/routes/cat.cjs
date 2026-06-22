const express = require('express');
const pool = require('../db.cjs');

const router = express.Router();

// ─── Default CAT topics with subtopics ──────────────────────────────────────

const DEFAULT_TOPICS = {
  maths: [
    { topic: 'Arithmetic', subtopic: 'Percentages, Profit & Loss, Discount' },
    { topic: 'Arithmetic', subtopic: 'Ratio, Proportion, and Variation' },
    { topic: 'Arithmetic', subtopic: 'Averages, Mixtures, and Alligations' },
    { topic: 'Arithmetic', subtopic: 'Simple and Compound Interest' },
    { topic: 'Arithmetic', subtopic: 'Time, Speed, and Distance' },
    { topic: 'Arithmetic', subtopic: 'Time and Work' },
    { topic: 'Algebra', subtopic: 'Linear and Quadratic Equations' },
    { topic: 'Algebra', subtopic: 'Inequalities and Modulus' },
    { topic: 'Algebra', subtopic: 'Functions and Graphs' },
    { topic: 'Algebra', subtopic: 'Logarithms' },
    { topic: 'Algebra', subtopic: 'Polynomials' },
    { topic: 'Algebra', subtopic: 'Sequences and Series (AP, GP, HP)' },
    { topic: 'Algebra', subtopic: 'Surds and Indices' },
    { topic: 'Geometry & Mensuration', subtopic: 'Triangles (Properties, Similarity, Congruence)' },
    { topic: 'Geometry & Mensuration', subtopic: 'Circles (Chords, Tangents, Secants)' },
    { topic: 'Geometry & Mensuration', subtopic: 'Lines and Angles' },
    { topic: 'Geometry & Mensuration', subtopic: 'Quadrilaterals and Polygons' },
    { topic: 'Geometry & Mensuration', subtopic: 'Coordinate Geometry' },
    { topic: 'Geometry & Mensuration', subtopic: 'Trigonometry' },
    { topic: 'Geometry & Mensuration', subtopic: 'Mensuration (2D Areas & 3D Volumes)' },
    { topic: 'Number System', subtopic: 'Divisibility Rules and Factors' },
    { topic: 'Number System', subtopic: 'LCM and HCF' },
    { topic: 'Number System', subtopic: 'Remainders (Remainder Theorem, Cyclicity)' },
    { topic: 'Number System', subtopic: 'Base Systems (Conversions)' },
    { topic: 'Number System', subtopic: 'Factorials and Trailing Zeros' },
    { topic: 'Number System', subtopic: 'Prime and Composite Numbers' },
    { topic: 'Modern Maths', subtopic: 'Permutations and Combinations' },
    { topic: 'Modern Maths', subtopic: 'Probability' },
    { topic: 'Modern Maths', subtopic: 'Set Theory and Venn Diagrams' },
    { topic: 'Modern Maths', subtopic: 'Binomial Theorem' },
  ],
  lrdi: [
    { topic: 'Data Interpretation', subtopic: 'Bar Graphs' },
    { topic: 'Data Interpretation', subtopic: 'Line Charts' },
    { topic: 'Data Interpretation', subtopic: 'Pie Charts' },
    { topic: 'Data Interpretation', subtopic: 'Tables' },
    { topic: 'Data Interpretation', subtopic: 'Mixed Graphs' },
    { topic: 'Data Interpretation', subtopic: 'Caselets (paragraph form)' },
    { topic: 'Data Interpretation', subtopic: 'Data Sufficiency' },
    { topic: 'Data Interpretation', subtopic: 'Venn Diagrams' },
    { topic: 'Analysis Skills', subtopic: 'Percentage & Ratio-based Analysis' },
    { topic: 'Analysis Skills', subtopic: 'Growth/Decline' },
    { topic: 'Analysis Skills', subtopic: 'Comparisons Across Categories' },
    { topic: 'Analysis Skills', subtopic: 'Averages/Medians/Totals' },
    { topic: 'Analysis Skills', subtopic: 'Inferences Based on Conditions' },
  ],
  english: [
    { topic: 'Verbal Ability', subtopic: 'Reading Comprehension' },
    { topic: 'Verbal Ability', subtopic: 'Summarise' },
    { topic: 'Verbal Ability', subtopic: 'Place the Sentence' },
    { topic: 'Verbal Ability', subtopic: 'Sentence Sequencing' },
  ],
};

// ─── Seed topics for a user ─────────────────────────────────────────────────

async function seedTopicsForUser(userId) {
  const { rows } = await pool.query(
    'SELECT COUNT(*) as count FROM cat_topics WHERE user_id = $1', [userId]
  );
  if (parseInt(rows[0].count) > 0) return; // Already seeded

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let sortOrder = 0;
    for (const [subject, topics] of Object.entries(DEFAULT_TOPICS)) {
      for (const t of topics) {
        await client.query(
          'INSERT INTO cat_topics (user_id, subject, topic, subtopic, completed, sort_order) VALUES ($1, $2, $3, $4, 0, $5)',
          [userId, subject, t.topic, t.subtopic, sortOrder++]
        );
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// GET /api/cat/topics — get all topics grouped by subject
router.get('/topics', async (req, res) => {
  try {
    const userId = req.user.id;
    await seedTopicsForUser(userId);

    const { rows } = await pool.query(
      'SELECT * FROM cat_topics WHERE user_id = $1 ORDER BY subject ASC, sort_order ASC',
      [userId]
    );

    // Group by subject → topic
    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.subject]) grouped[row.subject] = {};
      if (!grouped[row.subject][row.topic]) grouped[row.subject][row.topic] = [];
      grouped[row.subject][row.topic].push(row);
    }

    res.json({ topics: grouped });
  } catch (err) {
    console.error('Get CAT topics error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/cat/topics/:id/toggle — toggle topic completion
router.put('/topics/:id/toggle', async (req, res) => {
  try {
    const userId = req.user.id;
    const topicId = parseInt(req.params.id, 10);

    const { rows: [topic] } = await pool.query(
      'SELECT * FROM cat_topics WHERE id = $1 AND user_id = $2', [topicId, userId]
    );
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    const newCompleted = topic.completed ? 0 : 1;
    await pool.query('UPDATE cat_topics SET completed = $1 WHERE id = $2', [newCompleted, topicId]);

    const { rows: [updated] } = await pool.query('SELECT * FROM cat_topics WHERE id = $1', [topicId]);
    res.json({ topic: updated });
  } catch (err) {
    console.error('Toggle CAT topic error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/cat/ask — send question to Gemini, solve, classify, save
router.post('/ask', async (req, res) => {
  try {
    const userId = req.user.id;
    const { questionText, questionImage } = req.body;

    if (!questionText && !questionImage) {
      return res.status(400).json({ error: 'Provide a question (text or image)' });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return res.status(503).json({ error: 'Gemini API key not configured. Set GEMINI_API_KEY on Render.' });
    }

    // Build the prompt parts
    const parts = [];

    if (questionImage) {
      // Extract mime type and base64 data
      const match = questionImage.match(/^data:(.*?);base64,(.*)$/);
      if (match) {
        parts.push({
          inlineData: { mimeType: match[1], data: match[2] }
        });
      }
    }

    parts.push({
      text: `You are a CAT exam expert tutor. ${questionText ? `Question: ${questionText}` : 'Solve the question in the image.'}

Solve this CAT exam question using the FASTEST and most efficient method. Show clear steps.

Then classify this question:
1. Subject: exactly one of: maths, lrdi, english
2. Topic: the specific topic area. For maths use one of: Arithmetic, Algebra, Geometry & Mensuration, Number System, Modern Maths. For LRDI use one of: Data Interpretation, Analysis Skills. For English use: Verbal Ability.

Respond in this exact JSON format (no markdown, no code fences):
{"solution": "your detailed step-by-step solution here", "subject": "maths or lrdi or english", "topic": "the topic name"}`
    });

    // Call Gemini API
    const model = questionImage ? 'gemini-2.0-flash' : 'gemini-2.0-flash';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.2 }
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', errText);
      return res.status(502).json({ error: 'Gemini API error' });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse the JSON response
    let solution, subject, topic;
    try {
      // Try to extract JSON from the response (handle markdown code fences)
      const jsonMatch = rawText.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        solution = parsed.solution || rawText;
        subject = ['maths', 'lrdi', 'english'].includes(parsed.subject) ? parsed.subject : 'maths';
        topic = parsed.topic || null;
      } else {
        solution = rawText;
        subject = 'maths';
        topic = null;
      }
    } catch {
      solution = rawText;
      subject = 'maths';
      topic = null;
    }

    // Save to revision_questions
    const { rows: [saved] } = await pool.query(
      `INSERT INTO revision_questions (user_id, subject, topic, question_text, question_image, solution)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, subject, topic, questionText || null, questionImage || null, solution]
    );

    res.json({ question: saved, solution, subject, topic });
  } catch (err) {
    console.error('CAT ask error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/cat/revision/:subject — get revision questions for a subject
router.get('/revision/:subject', async (req, res) => {
  try {
    const userId = req.user.id;
    const subject = req.params.subject;
    if (!['maths', 'lrdi', 'english'].includes(subject)) {
      return res.status(400).json({ error: 'Subject must be maths, lrdi, or english' });
    }

    const { rows } = await pool.query(
      'SELECT * FROM revision_questions WHERE user_id = $1 AND subject = $2 ORDER BY created_at DESC',
      [userId, subject]
    );
    res.json({ questions: rows });
  } catch (err) {
    console.error('Get revision questions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/cat/revision — get counts per subject
router.get('/revision', async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      'SELECT subject, COUNT(*) as count FROM revision_questions WHERE user_id = $1 GROUP BY subject',
      [userId]
    );
    const counts = { maths: 0, lrdi: 0, english: 0 };
    for (const r of rows) counts[r.subject] = parseInt(r.count);
    res.json({ counts });
  } catch (err) {
    console.error('Get revision counts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/cat/revision/:id — delete a revision question
router.delete('/revision/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const id = parseInt(req.params.id, 10);
    const { rows } = await pool.query(
      'SELECT id FROM revision_questions WHERE id = $1 AND user_id = $2', [id, userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Question not found' });
    await pool.query('DELETE FROM revision_questions WHERE id = $1', [id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Delete revision question error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
