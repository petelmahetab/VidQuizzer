
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import dotenv from 'dotenv'
dotenv.config()

class AIService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_AI_KEY);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }
  

  // Generate summary from transcript
  async generateSummary(transcript, type = 'detailed', language = 'en') {
    try {
      const prompts = {
        brief: `Summarize this video transcript in 2-3 sentences, focusing on the main points:\n\n${transcript}`,
        detailed: `Provide a comprehensive summary of this video transcript, including main topics, key insights, and important details:\n\n${transcript}`,
        comprehensive: `Create a thorough analysis of this video transcript including: main themes, detailed explanations, examples mentioned, conclusions, and actionable insights:\n\n${transcript}`,
        bullet_points: `Convert this video transcript into clear bullet points covering all major topics and subtopics:\n\n${transcript}`,
        key_insights: `Extract the most important insights, lessons, and takeaways from this video transcript:\n\n${transcript}`
      };

      const systemPrompt = `You are an expert content summarizer. Create summaries that are clear, concise, and capture the essence of the content. Respond in ${language} language.`;
      const userPrompt = prompts[type] || prompts.detailed;
      
      const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

      const result = await this.model.generateContent(fullPrompt);
      console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY);
      const response = await result.response;
      const content = response.text();

      
      return {
        content: content,
        wordCount: content.split(/\s+/).length,
        model: 'gemini-1.5-flash'
      };
    } catch (error) {
      console.error('Summary generation error:', error);
      throw new Error('Failed to generate summary');
    }
  }
  

  // Generate questions from transcript
  async generateQuestions(transcript, count = 5, difficulty = 'medium', types = ['multiple_choice', 'short_answer']) {
    try {
      const prompt = `Based on this video transcript, generate ${count} ${difficulty} difficulty questions. 
      Include these types: ${types.join(', ')}.
      
      For multiple choice questions, provide 4 options with one correct answer.
      For short answer questions, provide the expected answer and explanation.
      
      Format the response as a JSON array with this structure:
      [
        {
          "question": "Question text",
          "type": "multiple_choice",
          "difficulty": "${difficulty}",
          "options": [
            {"text": "Option 1", "isCorrect": false},
            {"text": "Option 2", "isCorrect": true},
            {"text": "Option 3", "isCorrect": false},
            {"text": "Option 4", "isCorrect": false}
          ],
          "correctAnswer": "Option 2",
          "explanation": "Explanation of why this is correct",
          "timestamp": 120,
          "category": "comprehension"
        }
      ]
      
      You are an expert educator creating assessment questions. Generate high-quality questions that test understanding of the content.
      
      Transcript: ${transcript}`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const content = response.text();

      // Clean the response to extract JSON
      const cleanContent = content.replace(/```json|```/g, '').trim();
      const questions = JSON.parse(cleanContent);
      
      return questions.map(q => ({
        ...q,
        aiGenerated: true,
        aiModel: 'gemini-1.5-flash',
        confidence: Math.random() * 0.3 + 0.7 // Simulate confidence score
      }));
    } catch (error) {
      console.error('Question generation error:', error);
      throw new Error('Failed to generate questions');
    }
  }

  // Extract key topics from transcript
  async extractTopics(transcript) {
    try {
      const prompt = `Analyze this video transcript and extract the main topics, themes, and subjects discussed. 
      Return a JSON array with this structure:
      [
        {
          "name": "Topic name",
          "relevance": 0.95,
          "mentions": 3,
          "description": "Brief description of the topic"
        }
      ]
      
      You are an expert content analyst. Extract and categorize topics from text content.
      
      Transcript: ${transcript}`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const content = response.text();

      // Clean the response to extract JSON
      const cleanContent = content.replace(/```json|```/g, '').trim();
      return JSON.parse(cleanContent);
    } catch (error) {
      console.error('Topic extraction error:', error);
      return [];
    }
  }

  // Analyze sentiment of transcript
  async analyzeSentiment(transcript) {
    try {
      const prompt = `Analyze the sentiment and emotional tone of this video transcript. 
      Return a JSON object with this structure:
      {
        "overall": "positive/negative/neutral",
        "confidence": 0.85,
        "emotions": [
          {"emotion": "excitement", "confidence": 0.7},
          {"emotion": "informative", "confidence": 0.9}
        ],
        "reasoning": "Brief explanation of the sentiment analysis"
      }
      
      You are an expert sentiment analyzer. Analyze the emotional tone and sentiment of text content.
      
      Transcript: ${transcript}`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const content = response.text();

      // Clean the response to extract JSON
      const cleanContent = content.replace(/```json|```/g, '').trim();
      return JSON.parse(cleanContent);
    } catch (error) {
      console.error('Sentiment analysis error:', error);
      return {
        overall: 'neutral',
        confidence: 0,
        emotions: [],
        reasoning: 'Analysis failed'
      };
    }
  }

  // Generate key points with timestamps
  async generateKeyPoints(transcript, timestampedText) {
    try {
      const prompt = `Based on this video transcript and timestamps, identify the most important key points and their approximate timestamps.
      
      Return a JSON array with this structure:
      [
        {
          "point": "Key point description",
          "timestamp": 120,
          "importance": 4,
          "category": "main_topic/supporting_detail/conclusion"
        }
      ]
      
      You are an expert content curator. Identify the most important points from video content with their timestamps.
      
      Transcript: ${transcript}
      
      Timestamped segments: ${JSON.stringify(timestampedText.slice(0, 10))}`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const content = response.text();

      // Clean the response to extract JSON
      const cleanContent = content.replace(/```json|```/g, '').trim();
      return JSON.parse(cleanContent);
    } catch (error) {
      console.error('Key points generation error:', error);
      return [];
    }
  }

  // Chat with video content
  async chatWithVideo(transcript, question, conversationHistory = []) {
    try {
      let conversationContext = '';
      if (conversationHistory.length > 0) {
        conversationContext = conversationHistory.map(msg => 
          `${msg.role}: ${msg.content}`
        ).join('\n');
      }

      const prompt = `You are an AI assistant that can answer questions about video content. 
      Use the following transcript to answer user questions accurately and helpfully.
      
      Video Transcript: ${transcript}
      
      ${conversationContext ? `Previous conversation:\n${conversationContext}\n` : ''}
      
      User question: ${question}`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const content = response.text();

      return {
        answer: content,
        timestamp: this.findRelevantTimestamp(transcript, question),
        confidence: Math.random() * 0.3 + 0.7
      };
    } catch (error) {
      console.error('Chat error:', error);
      throw new Error('Failed to process question');
    }
  }

  // Helper method to get max tokens based on summary type (not needed for Gemini but kept for compatibility)
  getMaxTokens(type) {
    const tokenLimits = {
      brief: 150,
      detailed: 800,
      comprehensive: 1500,
      bullet_points: 600,
      key_insights: 800
    };
    return tokenLimits[type] || 800;
  }

  // Helper method to find relevant timestamp (simplified)
  findRelevantTimestamp(transcript, question) {
    // This is a simplified implementation
    // In a real app, you'd use more sophisticated text matching
    const words = question.toLowerCase().split(' ');
    const transcriptLower = transcript.toLowerCase();
    
    for (const word of words) {
      const index = transcriptLower.indexOf(word);
      if (index !== -1) {
        // Rough estimation of timestamp based on text position
        return Math.floor((index / transcriptLower.length) * 300); // Assuming 5-minute video
      }
    }
    
    return 0;
  }
}

export default new AIService();