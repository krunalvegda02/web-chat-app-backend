import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { uploadOnCloudinary } from '../utils/cloudinary.js';

// ============================================================
// CONFIGURATION
// ============================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TARGET_LANGUAGE = 'hi'; // Hindi

// ============================================================
// 1. TRANSLATE TEXT (Azure Translator)
// ============================================================

/**
 * Translates text to the target language using OpenAI.
 * @param {string} text - The text to translate.
 * @param {string} targetLang - Target language code (default: 'hi' for Hindi).
 * @returns {{ translatedText: string, detectedLanguage: string }}
 */
export async function translateText(text, targetLang = TARGET_LANGUAGE) {
    if (!text || text.trim().length === 0) {
        return null;
    }

    if (!OPENAI_API_KEY) {
        console.warn('⚠️ [TRANSLATE] OpenAI API key missing');
        return { translatedText: text, detectedLanguage: 'unknown', skipped: true };
    }

    try {
        const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
        
        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: `You are a translation assistant. Translate the given text to ${targetLang === 'hi' ? 'Hindi' : targetLang}. Only return the translated text, nothing else. If the text is already in the target language, return it as is.`
                },
                {
                    role: 'user',
                    content: text.trim()
                }
            ],
            max_tokens: 1000,
            temperature: 0.3
        });

        const translatedText = response.choices[0]?.message?.content?.trim() || text;
        
        console.log(`✅ [TRANSLATE:OPENAI] → ${targetLang}: "${text.substring(0, 30)}..."`);
        return { translatedText, detectedLanguage: 'auto', skipped: false };
    } catch (error) {
        console.error('❌ [TRANSLATE:OPENAI] Error:', error.message);
        return { translatedText: text, detectedLanguage: 'unknown', skipped: true };
    }
}

// ============================================================
// 2. TRANSCRIBE AUDIO (OpenAI Whisper)
// ============================================================

/**
 * Downloads audio from a URL and transcribes it using OpenAI Whisper.
 * @param {string} audioUrl - Public URL of the audio file.
 * @returns {{ text: string, detectedLanguage: string }}
 */
export async function transcribeAudio(audioUrl) {
    if (!OPENAI_API_KEY) {
        console.warn('⚠️ [WHISPER] OPENAI_API_KEY not set, skipping transcription');
        return null;
    }

    if (!audioUrl) {
        return null;
    }

    // Inner function for the actual Whisper call
    const callWhisper = async (buffer, filename, mimeType) => {
        const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
        return await openai.audio.transcriptions.create({
            file: await OpenAI.toFile(buffer, filename, { type: mimeType }),
            model: 'whisper-1',
            response_format: 'verbose_json',
        });
    };

    try {
        // 1. Download the audio file directly into a buffer
        console.log(`📥 [WHISPER] Downloading audio from: ${audioUrl.substring(0, 80)}...`);
        const axios = (await import('axios')).default;
        let audioResponse = await axios.get(audioUrl, {
            responseType: 'arraybuffer',
            timeout: 30000,
        });

        let audioBuffer = Buffer.from(audioResponse.data);
        const fileSignature = audioBuffer.slice(0, 4).toString('hex');
        console.log(`💾 [WHISPER] Downloaded audio buffer (${audioBuffer.length} bytes). Signature: ${fileSignature}`);

        try {
            // 2. Initial attempt with original format
            console.log(`🤖 [WHISPER] Attempting transcription with original format...`);
            const transcription = await callWhisper(audioBuffer, 'audio.webm', 'audio/webm');

            const text = transcription.text || '';
            const detectedLanguage = transcription.language || 'unknown';
            console.log(`✅ [WHISPER] Transcribed (${detectedLanguage}): "${text.substring(0, 80)}..."`);
            return { text, detectedLanguage };

        } catch (initialError) {
            const initialMsg = initialError.response?.data?.error?.message || initialError.message;
            console.warn(`⚠️ [WHISPER] Initial attempt failed: ${initialMsg}`);

            // 3. FALLBACK: Try Cloudinary Transcoding (Convert to MP3)
            // If the URL is a Cloudinary URL, we can inject 'f_mp3' to get a clean MP3
            if (audioUrl.includes('cloudinary.com') && audioUrl.includes('/video/upload/')) {
                try {
                    console.log(`🔄 [WHISPER] Attempting Cloudinary MP3 transcode fallback...`);
                    const mp3Url = audioUrl.replace('/video/upload/', '/video/upload/f_mp3/');
                    const mp3Response = await axios.get(mp3Url, {
                        responseType: 'arraybuffer',
                        timeout: 30000,
                    });

                    const mp3Buffer = Buffer.from(mp3Response.data);
                    console.log(`💾 [WHISPER] Downloaded fallback MP3 buffer (${mp3Buffer.length} bytes)`);

                    const transcription = await callWhisper(mp3Buffer, 'audio.mp3', 'audio/mpeg');

                    const text = transcription.text || '';
                    const detectedLanguage = transcription.language || 'unknown';
                    console.log(`✅ [WHISPER:FALLBACK] Transcribed (${detectedLanguage}): "${text.substring(0, 80)}..."`);
                    return { text, detectedLanguage };
                } catch (fallbackError) {
                    console.error('❌ [WHISPER:FALLBACK] Fallback also failed:', fallbackError.message);
                }
            }
            return null;
        }
    } catch (error) {
        console.error('❌ [WHISPER] Download error:', error.message);
        return null;
    }
}

// ============================================================
// 3. TEXT TO SPEECH (Azure TTS)
// ============================================================

/**
 * Converts text to speech using OpenAI TTS and uploads to Cloudinary.
 * @param {string} text - Text to speak.
 * @param {string} voice - OpenAI TTS voice name (default: 'alloy').
 * @returns {{ audioUrl: string }}
 */
export async function textToSpeech(text, voice = 'alloy') {
    if (!text || text.trim().length === 0) {
        return null;
    }

    if (!OPENAI_API_KEY) {
        console.warn('⚠️ [TTS] OpenAI API key missing');
        return null;
    }

    const tempFilePath = path.join(os.tmpdir(), `tts_${Date.now()}.mp3`);

    try {
        console.log(`🎤 [TTS:OPENAI] Synthesizing speech...`);
        const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
        
        const response = await openai.audio.speech.create({
            model: 'tts-1',
            voice: voice,
            input: text.trim(),
            response_format: 'mp3'
        });

        const audioBuffer = Buffer.from(await response.arrayBuffer());
        
        // Save and upload
        fs.writeFileSync(tempFilePath, audioBuffer);
        console.log(`💾 [TTS] Saved temp audio: ${tempFilePath} (${audioBuffer.length} bytes)`);

        // Upload to Cloudinary
        const cloudinaryResult = await uploadOnCloudinary(tempFilePath, {
            folder: 'chat/translated_audio',
            resource_type: 'video', // Cloudinary uses 'video' for audio
        });

        const audioUrl = cloudinaryResult.secure_url;
        console.log(`✅ [TTS] Uploaded translated audio: ${audioUrl}`);

        return { audioUrl };
    } catch (error) {
        console.error('❌ [TTS] Processing error:', error.message);
        return null;
    } finally {
        // Cleanup temp file
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
    }
}

// ============================================================
// FULL VOICE PIPELINE
// ============================================================

/**
 * Complete voice translation pipeline:
 * 1. Transcribe audio (Whisper)
 * 2. Translate text (Azure Translator)
 * 3. Synthesize translated audio (Azure TTS)
 *
 * @param {string} audioUrl - URL of the original audio
 * @returns {object|null} Translation result
 */
export async function translateVoiceMessage(audioUrl) {
    console.log(`🎙️ [VOICE_PIPELINE] Starting voice translation for: ${audioUrl?.substring(0, 60)}...`);

    // Step 1: Transcribe
    const transcription = await transcribeAudio(audioUrl);
    if (!transcription || !transcription.text) {
        console.warn('⚠️ [VOICE_PIPELINE] Transcription failed or empty result');
        return null;
    }

    // Step 2: Translate text to Hindi
    let translatedTranscription = transcription.text;
    let isTranslated = false;
    let originalLanguage = transcription.detectedLanguage;

    try {
        const translation = await translateText(transcription.text, TARGET_LANGUAGE);
        if (translation && !translation.skipped) {
            translatedTranscription = translation.translatedText;
            isTranslated = true;
            originalLanguage = translation.detectedLanguage || originalLanguage;
            console.log(`✅ [VOICE_PIPELINE] Text translation success: ${originalLanguage} → hi`);
        } else {
            console.log(`📝 [VOICE_PIPELINE] Text translation skipped or returned same text`);
        }
    } catch (err) {
        console.error(`❌ [VOICE_PIPELINE] Text translation error:`, err.message);
    }

    // Step 3: Convert Hindi text to speech
    let translatedAudioUrl = null;
    try {
        const ttsResult = await textToSpeech(translatedTranscription);
        translatedAudioUrl = ttsResult?.audioUrl || null;
        if (translatedAudioUrl) {
            console.log(`✅ [VOICE_PIPELINE] TTS success: ${translatedAudioUrl}`);
        }
    } catch (err) {
        console.error(`❌ [VOICE_PIPELINE] TTS error:`, err.message);
    }

    return {
        transcription: transcription.text,
        originalLanguage: originalLanguage,
        translatedTranscription: translatedTranscription,
        translatedAudioUrl: translatedAudioUrl,
        isTranslated: isTranslated,
    };
}

// ============================================================
// HELPERS
// ============================================================

export default {
    translateText,
    transcribeAudio,
    textToSpeech,
    translateVoiceMessage,
};
