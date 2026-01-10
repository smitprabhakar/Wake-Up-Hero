
import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getMotivationalMessage = async (missionType: string) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `The user just completed a ${missionType} mission to wake up. 
                 Give them a short, punchy, high-energy 2-sentence morning greeting to keep them awake. 
                 Make it slightly aggressive but motivational, like a drill sergeant who loves them.`,
    });
    return response.text || "Mission accomplished! Now stay awake!";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "You did it! Now don't you dare go back to bed!";
  }
};

export const getWakeUpCallAudio = async () => {
  try {
    const prompt = `SHOUT AT THE USER: WAKE UP HERO! THE SUN IS UP! THE GRIND NEVER STOPS! GET OUT OF BED RIGHT NOW AND CRUSH YOUR MISSIONS! SUCCESS DOES NOT WAIT FOR SLEEPYHEADS! MOVE MOVE MOVE!`;
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Fenrir' }, // Fenrir is often a deeper, more aggressive voice
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return base64Audio;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
};
