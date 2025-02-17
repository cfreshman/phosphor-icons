import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { icons } from '@phosphor-icons/core'
import dotenv from 'dotenv'

// Load environment variables
const env = process.env.NODE_ENV || 'development'
dotenv.config({ path: `.env.${env}` })

const { VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY, VITE_OPENAI_API_KEY } = process.env

if (!VITE_SUPABASE_URL || !SUPABASE_SERVICE_KEY || !VITE_OPENAI_API_KEY) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY)
const openai = new OpenAI({ apiKey: VITE_OPENAI_API_KEY })

async function generateEmbedding(text: string) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  })
  return response.data[0].embedding
}

async function main() {
  console.log('Starting embedding generation...')
  let processed = 0
  
  for (const icon of icons) {
    const { name, tags, categories } = icon
    
    // Create rich text description for embedding
    const description = `
      Icon name: ${name}
      Tags: ${tags.join(', ')}
      Categories: ${categories.join(', ')}
    `.trim()
    
    try {
      // Generate embedding
      const embedding = await generateEmbedding(description)
      
      // Store in Supabase
      const { error } = await supabase
        .from('icon_embeddings')
        .upsert({
          icon_name: name,
          embedding,
          metadata: {
            tags,
            categories
          }
        })
      
      if (error) {
        console.error(`Error storing embedding for ${name}:`, error)
        continue
      }
      
      processed++
      if (processed % 10 === 0) {
        console.log(`Processed ${processed}/${icons.length} icons`)
      }
    } catch (error) {
      console.error(`Error processing ${name}:`, error)
    }
  }
  
  console.log(`Embedding generation complete! Processed ${processed}/${icons.length} icons`)
}

main().catch(console.error) 