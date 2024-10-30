import {app, getContext} from '@getcronit/pylon'
import {Ai} from '@cloudflare/ai'
import {uploadFile} from './open-storage-gateway'

const imageUpload = async (base64Image) => {
  // Create a File from the base64 image
  const imageFile = new File([Buffer.from(base64Image, 'base64')], 'generated-image.png', { type: 'image/png' });

  // Upload the image to the storage service
  const uploadResponse = await uploadFile(imageFile, 'generated-image.png');

  return uploadResponse.fileUrl

}

export const graphql = {
  Query: {
    hello: async () => {
      const ctx = getContext();
      console.log(ctx.env);

      const ai = new Ai((ctx.env as any).AI);

      const AiResponse = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
        prompt: "What is the origin of the phrase Hello, World",
      });

      return AiResponse.response;
    },
    textGeneration: async (prompt: string) => {
      const ctx = getContext();
      console.log(ctx.env);

      const ai = new Ai((ctx.env as any).AI);

      const AiResponse = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
        prompt,
      });

      return AiResponse.response;
    },
    mesagona_recommendation: async () => {
      const prompt = '{"name": "Simon", "kind_of_products": ["male"], "skin_goals": ["firmness_elasticity", "fight_dry_skin""], "motivation": ["ai_skincare_expert", "save_time"], "routine": "complete_routine", "biggest_concern": "bright_skin", "product_preferences": ["hypoallergenic"], "skinType": "oily", "acneRisk": "veryHigh", "hydrationLevel": "normalHydration", "pHValue": "pH2"}'
      const ctx = getContext();
      console.log(ctx.env);

      const ai = new Ai((ctx.env as any).AI);

      const AiResponse = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
        prompt,
      });

      return AiResponse.response;
    },
    imageToText: async (prompt: string, imageUrl: string) => {
      const ctx = getContext();
      console.log(ctx.env);

      const ai = new Ai((ctx.env as any).AI);

      const res = await fetch(imageUrl);
      const blob = await res.arrayBuffer();

      const AiResponse = await ai.run(
        "@cf/llava-hf/llava-1.5-7b-hf",
        {
          image: [...new Uint8Array(blob)],
          prompt,
          max_tokens: 512,
        }
      );

      return AiResponse.description;
    },
    textToImage: async (prompt: string) => {
      const ctx = getContext();
      console.log(ctx.env);
    
      const ai = new Ai((ctx.env as any).AI);
    
      // Run the AI model with the prompt
      const AiResponse = await ai.run("@cf/stabilityai/stable-diffusion-xl-base-1.0", {
        prompt,
      });
    
      // Read the data from the ReadableStream
      const reader = AiResponse.getReader();
      let chunks = [];
      let done, value;
    
      // Loop to read all chunks of the stream
      while (!done) {
        ({ done, value } = await reader.read());
        if (value) {
          chunks.push(value);
        }
      }
    
      // Concatenate all chunks into a single Uint8Array
      const imageBuffer = new Uint8Array(chunks.reduce((acc, chunk) => acc.concat(Array.from(chunk)), []));
    
      // Convert the buffer to a base64 string
      const base64Image = Buffer.from(imageBuffer).toString("base64");

    
      // Return the uploaded image URL
      return {
        url: () => imageUpload(base64Image),
        base64Url: `data:image/png;base64,${base64Image}`
      }
    }
  },
  Mutation: {}
}


app.get('/hello', async c => {
  console.log(c.env);
  const ai = (c.env as any).AI as Ai;
  
  const response = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
    prompt: "What is the origin of the phrase Hello, World",
  });

  return c.text(JSON.stringify(response));
});

export default app
