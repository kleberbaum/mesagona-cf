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

      // const AiResponse = await ai.run("@cf/mistral/mistral-7b-instruct-v0.2-lora", {
      //   prompt,
      //   //messages: [{"role": "user", "content": "Hello world"}],
      //   //raw: true, //skip applying the default chat template
      //   //lora: "cc7f481e-8b70-45bd-b2a8-d39fc05511f9", //the finetune id OR name
      // });
      // const AiResponse = await ai.run("@cf/mistral/mistral-7b-instruct-v0.1", {
      //   raw: true,
      //   messages: [
      //     {
      //       "role": "user",
      //       "content": "Summarize the following: Some newspapers, TV channels and well-known companies publish false news stories to fool people on 1 April. One of the earliest examples of this was in 1957 when a programme on the BBC, the UKs national TV channel, broadcast a report on how spaghetti grew on trees. The film showed a family in Switzerland collecting spaghetti from trees and many people were fooled into believing it, as in the 1950s British people didnt eat much pasta and many didnt know how it was made! Most British people wouldnt fall for the spaghetti trick today, but in 2008 the BBC managed to fool their audience again with their Miracles of Evolution trailer, which appeared to show some special penguins that had regained the ability to fly. Two major UK newspapers, The Daily Telegraph and the Daily Mirror, published the important story on their front pages."
      //     }
      //   ],
      //   lora: "cf-public-cnn-summarization"
      // });
      const AiResponse = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
        //raw: true,
        messages: [
          {
            "role": "system",
            "content": 'Only provide a populated json in this format {"ingredients": [], "recommendation_text": ""}'
          },
          {
            "role": "user",
            "content": prompt
          }
        ],
        //lora: "cf-public-cnn-summarization"
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
