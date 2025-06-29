# LLM Story Generation Setup Guide

## 🎭 Overview

The Werewolf Mafia game now supports AI-generated intro stories using Language Models (LLMs). This feature creates atmospheric opening narratives that set the mood for each game theme.

## ✨ Features

- **Multiple LLM Providers**: Support for OpenAI, Anthropic, and local Ollama
- **Theme-Specific Stories**: Customized prompts for each game theme (Werewolf, Mafia, Vampire, Cartel)
- **Graceful Fallbacks**: High-quality hand-written stories when LLM is unavailable
- **Easy Configuration**: Simple JSON-based configuration system

## 🚀 Quick Setup

### 1. Create Configuration Files

First, create a `config` folder in your project root and add the configuration files:

```bash
mkdir config
```

### 2. Configure LLM Settings

Create `config/llm-config.json` with your preferred LLM provider:

#### Option A: OpenAI (Recommended)
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
    },
    "anthropic": {
      "apiKey": "YOUR_ANTHROPIC_API_KEY",
      "endpoint": "https://api.anthropic.com/v1/messages",
      "model": "claude-3-haiku-20240307",
      "maxTokens": 500,
      "temperature": 0.8,
      "enabled": false
    },
    "ollama": {
      "endpoint": "http://localhost:11434/api/chat",
      "model": "qwen2.5:7b",
      "maxTokens": 500,
      "temperature": 0.8,
      "enabled": false
    }
  },
  "defaultProvider": "openai",
  "basePrompt": "You are a master storyteller creating immersive opening narratives for social deduction games. Your stories should:\n\n1. Set the atmospheric tone and mood for the game theme\n2. Introduce the setting and basic situation without revealing specific roles\n3. Create tension and intrigue that draws players into the world\n4. Be 3-4 sentences long (approximately 150-200 words maximum)\n5. End with a hook that leads into the night phase\n6. Use vivid, atmospheric language that matches the theme\n7. Avoid mentioning specific player names or roles\n8. Focus on the collective danger and mystery all players face\n\nWrite in second person (\"you\") to immerse all players in the story. The story should make everyone feel they are part of this world, regardless of their secret role."
}
```

#### Option B: Local Ollama (Free, but requires local setup)
```json
{
  "providers": {
    "ollama": {
      "endpoint": "http://localhost:11434/api/chat",
      "model": "qwen2.5:7b",
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
  "defaultProvider": "ollama"
}
```

### 3. Copy Story Prompts

Copy the `config/story-prompts.json` file that was created in your project. This contains theme-specific prompts for each game type.

### 4. Get API Keys

#### OpenAI
1. Go to [OpenAI API](https://platform.openai.com/api-keys)
2. Create an account if needed
3. Generate an API key
4. Replace `"sk-your-openai-api-key-here"` in your config

#### Anthropic
1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Create an account if needed
3. Generate an API key
4. Replace `"YOUR_ANTHROPIC_API_KEY"` in your config

#### Ollama (Free Local Option)
1. Install [Ollama](https://ollama.ai/)
2. Run `ollama pull qwen2.5:7b` or your preferred model
3. Start Ollama service: `ollama serve`
4. No API key needed!

## 🎮 How It Works

1. **Game Start**: When players finish role assignment, the story generation begins
2. **Story Display**: A beautiful story intro screen appears for 8 seconds
3. **Night Phase**: Game automatically transitions to the night phase
4. **Fallback**: If LLM fails, high-quality hand-written stories are used

## 🛠️ Configuration Options

### LLM Provider Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `apiKey` | Your API key for the provider | Required for OpenAI/Anthropic |
| `model` | Model to use | `gpt-4o-mini` |
| `maxTokens` | Maximum story length | `500` |
| `temperature` | Creativity level (0-1) | `0.8` |
| `enabled` | Whether to use this provider | `true` |

### Story Customization

You can modify `config/story-prompts.json` to customize the prompts for each theme:

```json
{
  "werewolf": {
    "introPrompt": "Your custom werewolf story prompt here..."
  },
  "mafia": {
    "introPrompt": "Your custom mafia story prompt here..."
  }
}
```

## 🔧 Troubleshooting

### Stories Not Generating
1. Check console logs for error messages
2. Verify API key is correct and has credits
3. Ensure config files are in the right location
4. Test with fallback stories (they should always work)

### API Key Issues
- OpenAI: Check [usage dashboard](https://platform.openai.com/usage)
- Anthropic: Check [console](https://console.anthropic.com/)
- Verify no extra spaces or characters in API key

### Local Ollama Issues
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Pull a model if needed
ollama pull qwen2.5:7b

# Start Ollama service
ollama serve
```

## 💡 Tips

- **OpenAI GPT-4o-mini** is recommended for best quality and cost
- **Anthropic Claude** provides excellent creative writing
- **Local Ollama** is free but requires more setup
- Stories are cached per game, so each game gets a unique story
- Fallback stories are hand-crafted and high quality

## 🎯 Example Generated Story

> The rain-slicked streets of New Avalon glisten under flickering streetlights as you navigate the dangerous underbelly of the city. What started as isolated incidents has escalated into all-out war—three more bodies turned up in the harbor this morning, and everyone knows the Torrino family is making their move. You've all agreed to meet in secret, but trust is a luxury none of you can afford when the enemy wears familiar faces. As the clock strikes midnight and the city's honest folk lock their doors, you realize the real game is just beginning.

## 🔒 Security Notes

- Keep API keys secure and never commit them to version control
- Consider using environment variables for production deployments
- API keys should have minimal required permissions
- Monitor usage to avoid unexpected charges

## 📝 License

This feature integrates with third-party LLM services. Check their terms of service for usage restrictions. 