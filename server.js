// ============================================
//  PROMPTLY - AI CHATBOT | BACKEND SERVER
// ============================================
//  This file is the heart of the application.
//  It does 3 things:
//    1. Serves the frontend (index.html)
//    2. Connects to MySQL to store chat history
//    3. Talks to NVIDIA's AI API to generate responses
// ============================================


// ----- STEP 1: IMPORT REQUIRED PACKAGES -----

const express = require('express');       // Web server framework
const { OpenAI } = require('openai');     // AI API client (works with NVIDIA too)
const mysql = require('mysql2');           // MySQL database connector
const cors = require('cors');             // Allows frontend to call our API
const path = require('path');             // Helps with file paths
require('dotenv').config();               // Loads variables from .env file


// ----- STEP 2: CREATE & CONFIGURE THE SERVER -----

const app = express();
app.use(express.json());                                // Parse JSON request bodies
app.use(cors());                                        // Allow cross-origin requests
app.use(express.static(path.join(__dirname)));           // Serve static files (html, css, js)


// ----- STEP 3: SERVE THE FRONTEND -----
// When someone visits http://localhost:3000, send them index.html

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});


// ----- STEP 4: CONNECT TO MYSQL DATABASE -----
// This stores every conversation so we never lose chat history
// SSL is required by cloud databases like Aiven

const dbConfig = {
    host:     process.env.DB_HOST,         // Database server (localhost or cloud host)
    port:     process.env.DB_PORT || 3306, // Database port (default 3306)
    user:     process.env.DB_USER,         // Database username
    password: process.env.DB_PASSWORD,     // Database password
    database: process.env.DB_NAME          // Database name (promptly_db)
};

// If running in production (on Render), enable SSL for Aiven
if (process.env.DB_SSL === 'true') {
    dbConfig.ssl = { rejectUnauthorized: true };
}

const db = mysql.createConnection(dbConfig);

db.connect((err) => {
    if (err) {
        console.error('❌ Database connection failed:', err.stack);
    } else {
        console.log('✅ Connected to MySQL Database!');
    }
});


// ----- STEP 5: SET UP THE AI CLIENT -----
// We use the OpenAI SDK but point it to NVIDIA's API endpoint
// because our API key (nvapi-...) is from NVIDIA NIM

const openai = new OpenAI({
    apiKey:  process.env.OPENAI_API_KEY,
    baseURL: 'https://integrate.api.nvidia.com/v1',
});


// ----- STEP 6: CREATE THE CHAT ENDPOINT -----
// This is the main API route. The frontend sends a message here,
// we forward it to the AI, save the conversation, and send back the reply.

app.post('/chat', async (req, res) => {

    // 6a. Get the user's message from the request
    const { message } = req.body;

    // 6b. Validate — make sure the message isn't empty
    if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Message is required' });
    }

    try {
        // 6c. Send the message to the AI and wait for a response
        const response = await openai.chat.completions.create({
            model: 'meta/llama-3.1-8b-instruct',
            messages: [
                {
                    role: 'system',
                    content: 'You are Promptly, a helpful, friendly, and knowledgeable AI assistant. Provide clear, accurate, and well-structured responses. Use markdown formatting when appropriate.'
                },
                {
                    role: 'user',
                    content: message
                }
            ],
            temperature: 0.7,       // Controls creativity (0 = strict, 1 = creative)
            max_tokens: 1024,        // Maximum length of the AI's response
        });

        // 6d. Extract the AI's reply from the response
        const aiReply = response.choices[0].message.content;

        // 6e. Save the conversation to the database
        const query = 'INSERT INTO chat_history (user_message, ai_response) VALUES (?, ?)';
        db.query(query, [message, aiReply], (err) => {
            if (err) console.error('❌ Error saving to DB:', err);
            else console.log('💾 Chat saved to SQL!');
        });

        // 6f. Send the AI's reply back to the frontend
        res.json({ reply: aiReply });

    } catch (error) {
        // 6g. If anything goes wrong, log it and tell the frontend
        console.error('❌ AI API Error:', error?.message || error);
        res.status(500).json({ error: error?.message || 'AI service unavailable' });
    }
});


// ----- STEP 7: FETCH CHAT HISTORY -----
// Returns all past chats from the database for the sidebar

app.get('/history', (req, res) => {
    const query = 'SELECT * FROM chat_history ORDER BY created_at DESC';
    db.query(query, (err, results) => {
        if (err) {
            console.error('❌ Error fetching history:', err);
            return res.status(500).json({ error: 'Failed to fetch history' });
        }
        res.json({ history: results });
    });
});


// ----- STEP 8: DELETE A SINGLE CHAT -----
// Removes one chat entry from the database by its ID

app.delete('/history/:id', (req, res) => {
    const { id } = req.params;
    const query = 'DELETE FROM chat_history WHERE id = ?';
    db.query(query, [id], (err) => {
        if (err) {
            console.error('❌ Error deleting chat:', err);
            return res.status(500).json({ error: 'Failed to delete chat' });
        }
        res.json({ success: true });
    });
});


// ----- STEP 9: START THE SERVER -----
// Render assigns its own port via process.env.PORT
// Locally we use port 3000

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server live at http://localhost:${PORT}`);
});