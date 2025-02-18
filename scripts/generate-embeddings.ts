import { icons } from '@phosphor-icons/core'
import fs from 'fs'
import dotenv from 'dotenv'

// Load environment variables from root .env file
dotenv.config()

const { VITE_COHERE_KEY } = process.env

if (!VITE_COHERE_KEY) {
  console.error('Missing VITE_COHERE_KEY environment variable')
  process.exit(1)
}

// Using Cohere v2 API for embeddings
const API_URL = "https://api.cohere.ai/v2/embed"

// Add retry logic with exponential backoff
async function queryWithRetry(data: { texts: string[] }, maxRetries: number = 5): Promise<number[][]> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VITE_COHERE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          texts: data.texts,
          model: "embed-english-v3.0",
          input_type: "search_document",
          truncate: "END",
          embedding_types: ["float"]
        }),
      })

      if (response.status === 429) {
        const waitTime = Math.pow(2, i) * 1000
        console.log(`Rate limited, waiting ${waitTime/1000}s before retry ${i + 1}/${maxRetries}...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
        continue
      }

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`HTTP error! status: ${response.status}, message: ${error}`)
      }

      const result = await response.json()
      return result.embeddings.float
    } catch (error) {
      if (i === maxRetries - 1) throw error
      const waitTime = Math.pow(2, i) * 1000
      console.log(`Error, waiting ${waitTime/1000}s before retry ${i + 1}/${maxRetries}...`)
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
  }
  throw new Error('Max retries exceeded')
}

async function main() {
  console.log('Starting embedding generation...')
  
  const embeddings: { [key: string]: { embedding: string, metadata: any, format: 'float' | 'int16-compact' } } = {}
  
  // Load existing progress if any
  try {
    const existing = JSON.parse(fs.readFileSync('public/data/phosphor-embeddings.json', 'utf8'))
    Object.assign(embeddings, existing)
    console.log(`Loaded ${Object.keys(embeddings).length} existing embeddings`)
    console.log('Note: Delete public/data/phosphor-embeddings.json manually to regenerate all embeddings')
  } catch (e) {
    console.log('No existing embeddings found, starting fresh')
  }

  // Filter out icons that already have embeddings
  const remainingIcons = icons.filter(icon => !embeddings[icon.name])
  console.log(`${remainingIcons.length} icons remaining to process`)

  // Process icons in batches of 20 to stay within rate limits
  const BATCH_SIZE = 20
  const totalBatches = Math.ceil(remainingIcons.length/BATCH_SIZE)
  
  for (let i = 0; i < remainingIcons.length; i += BATCH_SIZE) {
    const batch = remainingIcons.slice(i, i + BATCH_SIZE)
    const descriptions = batch.map(icon => {
      const { name, tags, categories } = icon
      return `${name} - ${[...tags, ...categories].join(', ')}`
    })

    const batchNum = Math.floor(i/BATCH_SIZE) + 1
    process.stdout.write(`\rProcessing batch ${batchNum}/${totalBatches}...`)
    
    try {
      const batchEmbeddings = await queryWithRetry({ texts: descriptions })
      
      // Store each embedding
      batch.forEach((icon, j) => {
        const rawEmbedding = batchEmbeddings[j]
        
        // Convert to Int16 and store as compact string
        const int16Array = new Int16Array(rawEmbedding.length)
        for (let k = 0; k < rawEmbedding.length; k++) {
          int16Array[k] = Math.round(rawEmbedding[k] * 32767)
        }
        
        // Store as compact base64 string
        const buffer = Buffer.from(new Uint8Array(int16Array.buffer))
        const base64 = buffer.toString('base64')
        
        embeddings[icon.name] = {
          embedding: base64,
          metadata: { tags: icon.tags, categories: icon.categories },
          format: 'int16-compact'
        }
      })
      
      fs.mkdirSync('public/data', { recursive: true })
      fs.writeFileSync('public/data/phosphor-embeddings.json', JSON.stringify(embeddings, null, 2))
      
      // Rate limit between batches
      if (i + BATCH_SIZE < remainingIcons.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      
    } catch (error) {
      console.error(`\nError processing batch:`, error)
      process.exit(1)
    }
  }
  
  const finalSize = Buffer.byteLength(JSON.stringify(embeddings))
  console.log(`\n\nEmbedding generation complete!`)
  console.log(`Generated ${remainingIcons.length} new embeddings`)
  console.log(`Total embeddings: ${Object.keys(embeddings).length}`)
  console.log(`Total file size: ${(finalSize / 1024).toFixed(2)} KB`)
}

main().catch(console.error) 