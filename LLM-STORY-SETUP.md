# LLM Story Generation Setup Guide

## 🎭 Overview

The Werewolf Mafia game supports AI-generated intro stories using Language Models (LLMs). The system runs entirely in the host browser and creates atmospheric opening narratives with player character details.

## ✨ Features

- **Multiple LLM Providers**: Support for Venice.ai, OpenAI, Anthropic, and local Ollama
- **Player Character Integration**: Stories include player names, genders, and occupations
- **Pure Host-Authoritative**: LLM calls made directly from host browser (no server processing)
- **Simplified Prompts**: Standardized format across all themes
- **Graceful Fallbacks**: High-quality hand-written stories when LLM is unavailable

## 🚀 Quick Setup

### 1. Configure LLM Settings

Edit `apps/host/public/config/llm-config.json` with your preferred LLM provider:

#### Option A: Venice.ai (Recommended - Privacy-focused)
```json
{
  "providers": {
    "venice": {
      "apiKey": "vk-your-venice-api-key-here",
      "endpoint": "https://api.venice.ai/api/v1/chat/completions",
      "model": "llama-3.2-3b",
      "maxTokens": 500,
      "temperature": 0.8,
      "enabled": true
    },
    "openai": {
      "apiKey": "YOUR_OPENAI_API_KEY",
      "endpoint": "https://api.openai.com/v1/chat/completions",
      "model": "gpt-4o-mini",
      "maxTokens": 500,
      "temperature": 0.8,
      "enabled": false
    }
  },
  "defaultProvider": "venice",
  "basePrompt": "You are a master storyteller and expert comedian creating a very humorous, adults-only opening narrative for a social deduction game in the style of Mafia/Werewolf where players attempt to deduce who the killers are. Your stories should: \n\n1. Be very funny\n2. Set the atmospheric tone and mood for the specific game theme (provided below) \n3. Be 2-3 sentences long (approximately 150-200 words maximum)\n4. End with a hook that leads into the night phase\n5. Use vivid, atmospheric language that matches the theme\n\nWrite in second person (\"you\") to immerse all players in the story. The story should make everyone feel they are part of this world, regardless of their secret role."
}
```

#### Option B: OpenAI
```json
{
  "providers": {
    "openai": {
      "apiKey": "sk-your-openai-api-key-here",
      "endpoint": "https://api.openai.com/v1/chat/completions",
      "model": "gpt-4o-mini",
      "maxTokens": 500,
      "temperature": 0.8,
      "enabled": true
    }
  },
  "defaultProvider": "openai"
}
```

#### Option C: Local Ollama (Free)
```json
{
  "providers": {
    "ollama": {
      "endpoint": "http://localhost:11434/api/chat",
      "model": "qwen2.5:7b",
      "maxTokens": 500,
      "temperature": 0.8,
      "enabled": true
    }
  },
  "defaultProvider": "ollama"
}
```

### 2. Get API Keys

#### Venice.ai (Recommended)
1. Go to [venice.ai](https://venice.ai)
2. Sign up for an account
3. Consider Pro Account for $10 free API credits
4. Generate an API key in dashboard
5. Replace `"vk-your-venice-api-key-here"` in config

#### OpenAI
1. Go to [OpenAI API](https://platform.openai.com/api-keys)
2. Create account and billing setup
3. Generate API key
4. Replace `"sk-your-openai-api-key-here"` in config

#### Ollama (Free Local)
1. Install [Ollama](https://ollama.ai/)
2. Run `ollama pull qwen2.5:7b`
3. Start: `ollama serve`
4. No API key needed!

## 🎮 How It Works

### Story Generation Flow
1. **Host Authority**: Host browser generates stories directly (no server processing)
2. **Player Details**: Includes all player names, genders, and occupations
3. **Simplified Prompts**: Uses standardized format across all themes
4. **Temporary Display**: Stories shown temporarily, not stored in game state
5. **Performance Optimized**: No server spam, no persistent state pollution

### Example Prompt Sent to LLM
```
[Base storytelling prompt]

THEME (What type of Killers?): Werewolves  
HOW MANY? 1

PLAYERS (Gender, Occupation)
Alice (Female, Baker)
Bob (Male, Blacksmith)
Charlie (Female, Mayor)
Diana (Male, Barmaid)
Eve (Female, Shopkeeper)
```

### Killer Count Logic
- **5-7 players** = 1 killer
- **8+ players** = 2 killers

## 🛠️ Configuration Options

### LLM Provider Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `apiKey` | Your API key | Required (except Ollama) |
| `model` | Model to use | Provider-specific |
| `maxTokens` | Maximum story length | `500` |
| `temperature` | Creativity (0-1) | `0.8` |
| `enabled` | Use this provider | `true` |

### Supported Providers

| Provider | Privacy | Cost | Setup |
|----------|---------|------|-------|
| **Venice.ai** | ✅ Privacy-first, no data storage | 💰 Low cost | Easy |
| **OpenAI** | ⚠️ Data used for training | 💰💰 Medium cost | Easy |
| **Anthropic** | ✅ Good privacy | 💰💰 Medium cost | Easy |
| **Ollama** | ✅ Fully local | 🆓 Free | Complex setup |

## 🔧 Troubleshooting

### Stories Not Generating
1. Check browser console for errors
2. Verify API key format and credits
3. Test network connectivity
4. Fallback stories should always work

### API Key Issues
- **Venice.ai**: Check dashboard balance/limits
- **OpenAI**: Check [usage dashboard](https://platform.openai.com/usage)  
- **Anthropic**: Check [console](https://console.anthropic.com/)
- Remove extra spaces/characters from API keys

### Ollama Issues
```bash
# Check if running
curl http://localhost:11434/api/tags

# Pull model
ollama pull qwen2.5:7b

# Start service  
ollama serve
```

## 🎯 Example Generated Story

**Prompt:**
```
THEME (What type of Killers?): Werewolves
HOW MANY? 1
PLAYERS (Gender, Occupation)
Alice (Female, Baker)
Bob (Male, Blacksmith)
```

**Generated Story:**
> The quaint village of Millbrook has always prided itself on Alice's warm bread and Bob's finest horseshoes, but tonight an ancient curse stirs in the shadows. As the full moon rises over the cobblestone streets, you all retire to your cottages, unaware that one among you harbors a terrible secret that will soon tear your peaceful community apart. The hunt is about to begin, and by dawn, nothing will ever be the same.

## 💡 Architecture Benefits

- **🚀 Pure Host-Authoritative**: Host controls everything, server only relays
- **⚡ Zero Server Overhead**: No LLM processing burden on server
- **🔧 No Persistent State**: Stories displayed temporarily, no game state bloat  
- **🌐 Browser-Based**: Utilizes client resources efficiently
- **📊 Performance**: Eliminates server spam from story broadcasts

## 🔒 Security Notes

- API keys stored in browser-accessible config (consider environment variables for production)
- Venice.ai offers best privacy (no data storage/training)
- Monitor API usage to avoid unexpected charges
- Keep API keys secure and rotate regularly

## 📝 Current Status

- ✅ Pure host-authoritative architecture implemented
- ✅ Venice.ai, OpenAI, Anthropic, Ollama support
- ✅ Player character integration (gender, occupation)
- ✅ Simplified prompt format
- ✅ Performance optimized (no server processing)
- ✅ Graceful fallbacks to hand-written stories 