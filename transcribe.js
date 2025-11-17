import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_KEY = "fae6aef01046408cb7e2c932adcf6e42"; // AssemblyAI API key
const uploadUrl = "https://api.assemblyai.com/v2/upload";
const transcribeUrl = "https://api.assemblyai.com/v2/transcript";

// Get audio file from command line argument
const audioFileName = process.argv[2];

console.log('🎵 Audio Transcription Tool');
console.log('━'.repeat(50));

if (!audioFileName) {
  console.log('\n❌ Error: Please provide an audio file path');
  console.log('\nUsage:');
  console.log('  node transcribe.js <audio-file-path>');
  console.log('\nExamples:');
  console.log('  node transcribe.js mp3s/manwhothinks.mp3');
  console.log('  node transcribe.js C:\\path\\to\\audio.mp3');
  console.log('  node transcribe.js audio.wav');
  process.exit(1);
}

// Support both relative and absolute paths
const audioPath = path.isAbsolute(audioFileName) 
  ? audioFileName 
  : path.join(__dirname, audioFileName);

async function uploadAudioFile(filePath) {
  console.log(`\n📤 Uploading: ${path.basename(filePath)}...`);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  
  const fileData = fs.readFileSync(filePath);
  
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { 
      "Authorization": API_KEY,
      "Content-Type": "application/octet-stream"
    },
    body: fileData
  });
  
  const data = await response.json();
  
  if (!data.upload_url) {
    throw new Error('Failed to upload audio file');
  }
  
  console.log('✅ Upload complete');
  return data.upload_url;
}

async function transcribeAudio(audioUrl) {
  console.log('\n🔄 Starting transcription...');
  
  const response = await fetch(transcribeUrl, {
    method: "POST",
    headers: { 
      "Authorization": API_KEY, 
      "Content-Type": "application/json" 
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      speaker_labels: false,
      punctuate: true,
      format_text: true,
      word_boost: [],
      boost_param: "default",
      disfluencies: false
    })
  });
  
  const job = await response.json();
  
  if (!job.id) {
    throw new Error('Failed to start transcription job');
  }
  
  console.log(`📝 Transcription job ID: ${job.id}`);
  
  // Poll for completion
  let statusCheck;
  let pollCount = 0;
  
  do {
    await new Promise(resolve => setTimeout(resolve, 5000));
    pollCount++;
    
    const pollResponse = await fetch(`${transcribeUrl}/${job.id}`, {
      headers: { "Authorization": API_KEY }
    });
    
    statusCheck = await pollResponse.json();
    
    if (statusCheck.status === "error" || statusCheck.status === "failed") {
      throw new Error(statusCheck.error || "Transcription failed");
    }
    
    if (statusCheck.status === "queued" || statusCheck.status === "processing") {
      process.stdout.write(`\r⏳ Processing... (${pollCount * 5}s elapsed)`);
    }
    
  } while (statusCheck.status !== "completed");
  
  console.log('\n✅ Transcription complete!\n');
  
  return statusCheck;
}

function displayTranscript(result) {
  console.log('━'.repeat(50));
  console.log('📄 TRANSCRIPT');
  console.log('━'.repeat(50));
  console.log();
  console.log(result.text);
  console.log();
  console.log('━'.repeat(50));
  console.log(`📊 Statistics:`);
  console.log(`   Words: ${result.words ? result.words.length : 0}`);
  console.log(`   Confidence: ${result.confidence ? (result.confidence * 100).toFixed(1) + '%' : 'N/A'}`);
  console.log(`   Duration: ${result.audio_duration ? (result.audio_duration / 1000).toFixed(1) + 's' : 'N/A'}`);
  console.log('━'.repeat(50));
}

function displayWords(words) {
  if (!words || words.length === 0) return;
  
  console.log('\n📝 Word-by-Word Transcript (with timestamps):');
  console.log('━'.repeat(50));
  
  words.forEach((word, index) => {
    const startTime = (word.start / 1000).toFixed(2);
    const endTime = (word.end / 1000).toFixed(2);
    const confidence = (word.confidence * 100).toFixed(0);
    
    console.log(`[${startTime}s - ${endTime}s] ${word.text} (${confidence}%)`);
    
    // Add a line break every 10 words for readability
    if ((index + 1) % 10 === 0) console.log();
  });
  
  console.log('━'.repeat(50));
}

async function main() {
  try {
    // Upload the audio file
    const uploadedUrl = await uploadAudioFile(audioPath);
    
    // Transcribe it
    const result = await transcribeAudio(uploadedUrl);
    
    // Display the full transcript
    displayTranscript(result);
    
    // Optionally display word-by-word breakdown
    if (process.argv.includes('--words')) {
      displayWords(result.words);
    } else {
      console.log('\n💡 Tip: Run with --words flag to see word-by-word timestamps');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
