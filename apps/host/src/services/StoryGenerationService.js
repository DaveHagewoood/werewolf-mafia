// Browser-based story generation service for host app
// This service runs in the host browser and calls LLM APIs directly

export class StoryGenerationService {
  constructor() {
    this.config = null;
    this.configLoaded = false;
    this.configLoadPromise = this.loadConfiguration();
  }

  async loadConfiguration() {
    try {
      console.log('🔧 Host: Loading LLM configuration...');
      
      // Load configuration files from public directory (accessible to browser)
      const configResponse = await fetch('/config/llm-config.json');
      if (!configResponse.ok) {
        throw new Error(`Failed to load config: ${configResponse.statusText}`);
      }
      this.config = await configResponse.json();
      console.log('✅ Host: LLM config loaded. Providers:', Object.keys(this.config.providers));

      this.configLoaded = true;
      console.log('✅ Host: Story generation service fully configured');
      
      // Test provider availability
      const provider = this.getEnabledProvider();
      if (provider) {
        console.log(`🎯 Host: Active provider: ${provider.name} (${provider.config.model})`);
      } else {
        console.log('⚠️ Host: No valid provider found - will use fallback stories');
      }
    } catch (error) {
      console.error('❌ Host: Story generation config loading failed:', error.message);
      console.warn('📝 Host: Story generation will be disabled. Using fallback stories.');
      this.configLoaded = true;
    }
  }

  isEnabled() {
    if (!this.configLoaded) {
      console.log('⏳ Host: Config not loaded yet, using fallback');
      return false;
    }
    
    const enabled = this.config && this.getEnabledProvider();
    console.log('🔍 Host: Service enabled check:', {
      hasConfig: !!this.config,
      hasProvider: !!this.getEnabledProvider(),
      result: enabled
    });
    
    return enabled;
  }

  getEnabledProvider() {
    if (!this.config) return null;
    
    console.log('🔍 Host: Checking providers...');
    console.log('Default provider:', this.config.defaultProvider);
    
    const defaultProvider = this.config.providers[this.config.defaultProvider];
    if (defaultProvider?.enabled && this.hasValidApiKey(this.config.defaultProvider)) {
      console.log(`✅ Host: Using default provider: ${this.config.defaultProvider}`);
      return { name: this.config.defaultProvider, config: defaultProvider };
    }

    // Find any other enabled provider with valid API key
    for (const [name, providerConfig] of Object.entries(this.config.providers)) {
      if (providerConfig.enabled && this.hasValidApiKey(name)) {
        console.log(`✅ Host: Using fallback provider: ${name}`);
        return { name, config: providerConfig };
      }
    }

    console.log('❌ Host: No valid providers found');
    return null;
  }

  hasValidApiKey(providerName) {
    const provider = this.config.providers[providerName];
    if (!provider) {
      console.log(`❌ Host: Provider ${providerName} not found`);
      return false;
    }

    if (providerName === 'ollama') {
      console.log(`✅ Host: Ollama doesn't require API key`);
      return true;
    }

    const hasKey = provider.apiKey && 
           provider.apiKey !== 'YOUR_OPENAI_API_KEY' && 
           provider.apiKey !== 'YOUR_ANTHROPIC_API_KEY' &&
           provider.apiKey !== 'YOUR_VENICE_API_KEY';
    
    console.log(`🔑 Host: API key check for ${providerName}:`, {
      hasApiKey: !!provider.apiKey,
      isNotDefault: provider.apiKey !== 'YOUR_OPENAI_API_KEY' && 
                    provider.apiKey !== 'YOUR_ANTHROPIC_API_KEY' &&
                    provider.apiKey !== 'YOUR_VENICE_API_KEY',
      result: hasKey
    });
    
    return hasKey;
  }

  async generateIntroStory(themeId, playerCount, playerNames = [], playerDetails = []) {
    console.log(`📖 Host: Story generation requested for theme: ${themeId}, players: ${playerCount}`);
    
    // Wait for config to load if it hasn't yet
    if (!this.configLoaded) {
      console.log('⏳ Host: Waiting for config to load...');
      await this.configLoadPromise;
    }
    
    // Always try to get fallback story first to ensure we have something
    const fallbackStory = this.getFallbackStory(themeId, playerCount);
    console.log(`📚 Host: Fallback story ready (${fallbackStory.length} chars)`);
    
    // Check if LLM generation is available (only need config, no theme prompts needed)
    if (!this.config || !this.getEnabledProvider()) {
      console.log('📖 Host: LLM story generation disabled, using fallback story');
      return fallbackStory;
    }

    const provider = this.getEnabledProvider();
    if (!provider) {
      console.log('📖 Host: No valid LLM provider, using fallback story');
      return fallbackStory;
    }

    try {
      console.log(`🎯 Host: Attempting ${provider.name} API call for story generation...`);
      const story = await this.callLLMProvider(provider, themeId, playerCount, playerDetails);
      console.log(`✨ Host: Generated intro story for ${themeId} theme (${story.length} chars)`);
      return story;
    } catch (error) {
      console.error('❌ Host: Story generation failed:', error.message);
      console.log('🔄 Host: Falling back to hand-written story');
      return fallbackStory;
    }
  }

  async generateDeathNarrative(deathData) {
    console.log(`💀 Host: Death narrative requested for ${deathData.eliminatedPlayer.name} (${deathData.type})`);
    
    // Wait for config to load if it hasn't yet
    if (!this.configLoaded) {
      console.log('⏳ Host: Waiting for config to load...');
      await this.configLoadPromise;
    }
    
    // Always have a fallback death message
    const fallbackDeath = this.getFallbackDeathNarrative(deathData);
    console.log(`📚 Host: Fallback death narrative ready`);
    
    // Check if LLM generation is available
    if (!this.config || !this.getEnabledProvider()) {
      console.log('💀 Host: LLM death generation disabled, using fallback');
      return fallbackDeath;
    }

    const provider = this.getEnabledProvider();
    if (!provider) {
      console.log('💀 Host: No valid LLM provider, using fallback death');
      return fallbackDeath;
    }

    try {
      console.log(`🎯 Host: Attempting ${provider.name} API call for death narrative...`);
      const deathStory = await this.callDeathLLMProvider(provider, deathData);
      console.log(`✨ Host: Generated death narrative (${deathStory.length} chars)`);
      return deathStory;
    } catch (error) {
      console.error('❌ Host: Death narrative generation failed:', error.message);
      console.log('🔄 Host: Falling back to simple death message');
      return fallbackDeath;
    }
  }

  async generateEndGameStory(endGameData) {
    console.log(`🏁 Host: End game story requested - ${endGameData.winner} victory`);
    
    // Wait for config to load if it hasn't yet
    if (!this.configLoaded) {
      console.log('⏳ Host: Waiting for config to load...');
      await this.configLoadPromise;
    }
    
    // Always have a fallback end game story
    const fallbackStory = this.getFallbackEndGameStory(endGameData);
    console.log(`📚 Host: Fallback end game story ready`);
    
    // Check if LLM generation is available
    if (!this.config || !this.getEnabledProvider()) {
      console.log('🏁 Host: LLM end game generation disabled, using fallback');
      return fallbackStory;
    }

    const provider = this.getEnabledProvider();
    if (!provider) {
      console.log('🏁 Host: No valid LLM provider, using fallback end game story');
      return fallbackStory;
    }

    try {
      console.log(`🎯 Host: Attempting ${provider.name} API call for end game story...`);
      const endStory = await this.callEndGameLLMProvider(provider, endGameData);
      console.log(`✨ Host: Generated end game story (${endStory.length} chars)`);
      return endStory;
    } catch (error) {
      console.error('❌ Host: End game story generation failed:', error.message);
      console.log('🔄 Host: Falling back to simple end game message');
      return fallbackStory;
    }
  }

  async callLLMProvider(provider, themePrompt, playerCount, playerDetails = []) {
    const { name, config } = provider;

    // Calculate number of killers based on player count (same logic as assignRoles)
    const numKillers = playerCount <= 7 ? 1 : 2;

    // Get theme display name for the prompt
    const themeDisplayNames = {
      'werewolf': 'Werewolves',
      'mafia': 'Mafia', 
      'vampire': 'Vampires',
      'cartel': 'Cartel'
    };
    const themeDisplayName = themeDisplayNames[themePrompt] || 'Killers';

    // Build player list section
    let playersListText = '';
    if (playerDetails && playerDetails.length > 0) {
      playersListText = '\nPLAYERS (Gender, Occupation)\n' + 
        playerDetails.map(player => 
          `${player.name} (${player.gender}, ${player.job})`
        ).join('\n');
    }

    const contextPrompt = `${this.config.basePrompt}

THEME (What type of Killers?): ${themeDisplayName}
HOW MANY? ${numKillers}
${playersListText}`;

    console.log(`🔮 Host: Preparing ${name} API call...`);
    console.log(`📝 Host: Prompt length: ${contextPrompt.length} chars`);
    
    if (playerDetails && playerDetails.length > 0) {
      console.log(`👥 Host: Including ${playerDetails.length} player details in story generation`);
      console.log(`🎭 Host: Player details: ${playerDetails.map(p => `${p.name} (${p.gender}, ${p.job})`).join(', ')}`);
    }
    
    console.log(`\n📜 FULL PROMPT SENT TO ${name.toUpperCase()}:`);
    console.log('='.repeat(80));
    console.log(contextPrompt);
    console.log('='.repeat(80));
    console.log('');

    switch (name) {
      case 'venice':
        return await this.callVenice(config, contextPrompt);
      case 'openai':
        return await this.callOpenAI(config, contextPrompt);
      case 'anthropic':
        return await this.callAnthropic(config, contextPrompt);
      case 'ollama':
        return await this.callOllama(config, contextPrompt);
      default:
        throw new Error(`Unsupported provider: ${name}`);
    }
  }

  async callVenice(config, prompt) {
    console.log('🏛️ Host: Making Venice.ai API call...');
    console.log('📊 Host: Request config:', {
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      apiKeyPrefix: config.apiKey?.substring(0, 10) + '...'
    });

    const requestBody = {
      model: config.model,
      messages: [
        { role: 'user', content: prompt }
      ],
      max_tokens: config.maxTokens,
      temperature: config.temperature
    };

    console.log('📤 Host: Sending request to Venice.ai...');

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    console.log('📥 Host: Venice.ai response received:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Host: Venice.ai API error response:', errorText);
      
      let error;
      try {
        error = JSON.parse(errorText);
      } catch {
        error = { error: { message: errorText } };
      }
      
      if (response.status === 429) {
        throw new Error(`Venice.ai rate limit exceeded: ${error.error?.message || 'Rate limit exceeded'}`);
      } else if (response.status === 401) {
        throw new Error(`Venice.ai authentication failed. Please check your API key: ${error.error?.message || 'Unauthorized'}`);
      } else {
        throw new Error(`Venice.ai API error (${response.status}): ${error.error?.message || response.statusText}`);
      }
    }

    const data = await response.json();
    console.log('✅ Host: Venice.ai response parsed successfully');

    const content = data.choices[0]?.message?.content?.trim();
    if (!content) {
      console.error('❌ Host: No content in Venice.ai response:', data);
      throw new Error('Venice.ai returned empty content');
    }

    console.log(`✨ Host: Story generated successfully via Venice.ai (${content.length} chars)`);
    return content;
  }

  async callOpenAI(config, prompt) {
    console.log('🤖 Host: Making OpenAI API call...');
    console.log('📊 Host: Request config:', {
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      apiKeyPrefix: config.apiKey?.substring(0, 10) + '...'
    });

    const requestBody = {
      model: config.model,
      messages: [
        { role: 'user', content: prompt }
      ],
      max_tokens: config.maxTokens,
      temperature: config.temperature
    };

    console.log('📤 Host: Sending request to OpenAI...');

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    console.log('📥 Host: OpenAI response received:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Host: OpenAI API error response:', errorText);
      
      let error;
      try {
        error = JSON.parse(errorText);
      } catch {
        error = { error: { message: errorText } };
      }
      
      if (response.status === 429) {
        throw new Error(`OpenAI quota exceeded. Please check your billing: ${error.error?.message || 'Rate limit or quota exceeded'}`);
      } else if (response.status === 401) {
        throw new Error(`OpenAI authentication failed. Please check your API key: ${error.error?.message || 'Unauthorized'}`);
      } else {
        throw new Error(`OpenAI API error (${response.status}): ${error.error?.message || response.statusText}`);
      }
    }

    const data = await response.json();
    console.log('✅ Host: OpenAI response parsed successfully');

    const content = data.choices[0]?.message?.content?.trim();
    if (!content) {
      console.error('❌ Host: No content in OpenAI response:', data);
      throw new Error('OpenAI returned empty content');
    }

    console.log(`✨ Host: Story generated successfully (${content.length} chars)`);
    return content;
  }

  async callAnthropic(config, prompt) {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        messages: [
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Anthropic API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.content[0]?.text?.trim() || 'Error generating story';
  }

  async callOllama(config, prompt) {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'user', content: prompt }
        ],
        stream: false,
        options: {
          num_predict: config.maxTokens,
          temperature: config.temperature
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.message?.content?.trim() || 'Error generating story';
  }

  getFallbackStory(themeId, playerCount) {
    const fallbackStories = {
      werewolf: "The ancient mountain village of Shadowmere has known peace for generations, but that tranquility shattered three nights ago when old Henrik was found torn apart in his cottage. The village elder speaks of an old curse—lycanthropes walking among you, indistinguishable from neighbors and friends during the day. As the sun sets behind the jagged peaks and darkness creeps through the cobblestone streets, you all retire to your homes, knowing that somewhere among you, predators wait for the moon to rise. Tonight, the hunt begins.",

      mafia: "The rain-slicked streets of New Avalon glisten under flickering streetlights as you navigate the dangerous underbelly of the city. What started as isolated incidents has escalated into all-out war—three more bodies turned up in the harbor this morning, and everyone knows the Torrino family is making their move. You've all agreed to meet in secret, but trust is a luxury none of you can afford when the enemy wears familiar faces. As the clock strikes midnight and the city's honest folk lock their doors, you realize the real game is just beginning. The shadows hold secrets, and some of your closest allies may be your deadliest enemies.",

      vampire: "The fog rolls through the cobblestone streets of Ravenscroft as church bells toll the midnight hour. What began as whispered rumors of strange deaths has become undeniable reality—the undead walk among the living, and their thirst for blood grows stronger each night. Behind lace curtains and gothic facades, ancient evil masquerades as trusted neighbors and beloved friends. As gaslight flickers and dies, casting long shadows across the town square, you each retreat to your dwellings with crosses clutched tight and prayers on your lips. But faith alone may not be enough to survive until dawn.",

      cartel: "The desert wind carries the scent of dust and danger through the border town of San Esperanza, where loyalty is bought with bullets and trust is a fatal weakness. The escalating violence has reached a breaking point—three more executions this week, each sending a clear message that the Sinaloa organization will stop at nothing to control this territory. You've all lived here long enough to know that anyone could be on their payroll, from the shopkeeper to the sheriff. As darkness falls and the cantinas empty, you realize survival depends on identifying the wolves among the sheep. In a place where everyone has secrets, the most dangerous ones hide behind friendly smiles."
    };

    return fallbackStories[themeId] || fallbackStories.werewolf;
  }

  getFallbackDeathNarrative(deathData) {
    const { eliminatedPlayer, type, gameTheme } = deathData;
    const name = eliminatedPlayer.name;
    const occupation = eliminatedPlayer.job || 'villager';

    const themeDisplayNames = {
      'werewolf': 'werewolves',
      'mafia': 'mafia', 
      'vampire': 'vampires',
      'cartel': 'cartel'
    };
    const killerType = themeDisplayNames[gameTheme] || 'killers';

    if (type === 'NIGHT_KILL') {
      const nightDeaths = [
        `${name} was found dead at dawn, another victim of the ${killerType}.`,
        `The ${killerType} claimed ${name} during the night.`,
        `${name} did not survive the night - the ${killerType} had struck again.`,
        `Dawn revealed ${name}'s fate - another victim of the lurking ${killerType}.`
      ];
      return nightDeaths[Math.floor(Math.random() * nightDeaths.length)];
    } else if (type === 'DAY_VOTE') {
      const dayDeaths = [
        `The community voted to eliminate ${name}, hoping to end the terror.`,
        `${name} was banished by the frightened townspeople.`,
        `In desperation, the survivors chose to eliminate ${name}.`,
        `${name} faced the judgment of the community and was voted out.`
      ];
      return dayDeaths[Math.floor(Math.random() * dayDeaths.length)];
    }
    
    return `${name} was eliminated from the game.`;
  }

  getFallbackEndGameStory(endGameData) {
    const { winner, gameTheme, survivorNames, eliminatedCount, winCondition } = endGameData;
    
    const themeDisplayNames = {
      'werewolf': 'werewolves',
      'mafia': 'mafia', 
      'vampire': 'vampires',
      'cartel': 'cartel'
    };
    const killerType = themeDisplayNames[gameTheme] || 'killers';

    if (winner === 'mafia') {
      // Evil wins
      const evilWins = [
        `As dawn breaks over the now-silent community, the ${killerType} emerge victorious. Their deception and brutality have triumphed, leaving only darkness in their wake.`,
        `The ${killerType} have achieved their sinister goal. With the last of their opposition eliminated, they now rule through fear and shadow.`,
        `Victory belongs to the ${killerType}. Their patient hunt through the night has succeeded, and the community falls under their malevolent control.`,
        `The terror is complete. The ${killerType} have eliminated all who stood against them, claiming the community as their own twisted domain.`
      ];
      return evilWins[Math.floor(Math.random() * evilWins.length)];
    } else if (winner === 'villagers') {
      // Good wins
      const goodWins = [
        `Light finally breaks through the darkness as the last of the ${killerType} falls. The community has triumphed through courage and unity, though the scars of this nightmare will remain forever.`,
        `Justice prevails at last. With the ${killerType} defeated, the survivors can finally breathe freely, knowing that their vigilance and determination have saved their community.`,
        `The reign of terror is over. Through sacrifice and perseverance, the good people have vanquished the ${killerType} and reclaimed their home from the shadows.`,
        `Hope is restored. The ${killerType} have been eliminated, and though many were lost along the way, the community's spirit remains unbroken.`
      ];
      return goodWins[Math.floor(Math.random() * goodWins.length)];
    }
    
    return "The game has concluded.";
  }

  async callDeathLLMProvider(provider, deathData) {
    const { name, config } = provider;
    const { eliminatedPlayer, type, gameTheme, originalStory, eliminationHistory, remainingPlayers } = deathData;

    // Get theme display name for killers
    const themeDisplayNames = {
      'werewolf': 'Werewolves',
      'mafia': 'Mafia', 
      'vampire': 'Vampires',
      'cartel': 'Cartel'
    };
    const killerType = themeDisplayNames[gameTheme] || 'Killers';

    // Build elimination history context
    let historyText = '';
    if (eliminationHistory && eliminationHistory.length > 0) {
      historyText = '\n\nPREVIOUS ELIMINATIONS:\n' + 
        eliminationHistory.map(death => 
          `- ${death.player.name} (${death.player.gender}, ${death.player.job}) - ${death.type === 'NIGHT_KILL' ? 'Killed by ' + killerType : 'Voted out by townspeople'}`
        ).join('\n');
    }

    // Build remaining players context
    let remainingText = '';
    if (remainingPlayers && remainingPlayers.length > 0) {
      remainingText = '\n\nREMAINING PLAYERS:\n' + 
        remainingPlayers.map(player => 
          `${player.name} (${player.gender}, ${player.job})`
        ).join(', ');
    }

    // Build death type specific prompt
    let deathPrompt = '';
    if (type === 'NIGHT_KILL') {
      deathPrompt = `NEW NIGHT ELIMINATION:
Player: ${eliminatedPlayer.name} (${eliminatedPlayer.gender}, ${eliminatedPlayer.job})
Death type: Killed by ${killerType}
Context: Continue the atmosphere established in the original story

Generate a brief death narrative (1-2 sentences) describing how ${eliminatedPlayer.name} was eliminated during the night. Keep it atmospheric and consistent with the original story's tone.`;
    } else if (type === 'DAY_VOTE') {
      deathPrompt = `NEW DAY ELIMINATION:
Player: ${eliminatedPlayer.name} (${eliminatedPlayer.gender}, ${eliminatedPlayer.job})
Death type: Voted out by the community
Context: Continue the atmosphere established in the original story

Generate a brief death narrative (1-2 sentences) describing how ${eliminatedPlayer.name} was eliminated by community vote during the day. Show the tension and suspicion among the remaining players.`;
    }

    const contextPrompt = `You are continuing a story you previously created. Maintain consistency with the original tone and setting.

ORIGINAL STORY:
${originalStory}
${historyText}
${remainingText}

${deathPrompt}`;

    console.log(`🔮 Host: Preparing ${name} API call for death narrative...`);
    console.log(`📝 Host: Death prompt length: ${contextPrompt.length} chars`);
    console.log(`💀 Host: Generating death for ${eliminatedPlayer.name} (${type})`);
    
    console.log(`\n📜 FULL DEATH PROMPT SENT TO ${name.toUpperCase()}:`);
    console.log('='.repeat(80));
    console.log(contextPrompt);
    console.log('='.repeat(80));
    console.log('');

    switch (name) {
      case 'venice':
        return await this.callVenice(config, contextPrompt);
      case 'openai':
        return await this.callOpenAI(config, contextPrompt);
      case 'anthropic':
        return await this.callAnthropic(config, contextPrompt);
      case 'ollama':
        return await this.callOllama(config, contextPrompt);
      default:
        throw new Error(`Unsupported provider: ${name}`);
    }
  }

  async callEndGameLLMProvider(provider, endGameData) {
    const { name, config } = provider;
    const { winner, gameTheme, originalStory, eliminationHistory, survivors, totalPlayers, winCondition } = endGameData;

    // Get theme display name for killers
    const themeDisplayNames = {
      'werewolf': 'Werewolves',
      'mafia': 'Mafia', 
      'vampire': 'Vampires',
      'cartel': 'Cartel'
    };
    const killerType = themeDisplayNames[gameTheme] || 'Killers';

    // Build elimination history context
    let historyText = '';
    if (eliminationHistory && eliminationHistory.length > 0) {
      historyText = '\n\nGAME HISTORY:\n' + 
        eliminationHistory.map(death => 
          `- ${death.player.name} (${death.player.gender}, ${death.player.job}) - ${death.type === 'NIGHT_KILL' ? 'Killed by ' + killerType : 'Voted out by townspeople'}`
        ).join('\n');
    }

    // Build survivors context
    let survivorsText = '';
    if (survivors && survivors.length > 0) {
      survivorsText = '\n\nSURVIVORS:\n' + 
        survivors.map(player => 
          `${player.name} (${player.gender}, ${player.job}) - ${player.role.name}`
        ).join('\n');
    }

    // Build victory-specific prompt
    let victoryPrompt = '';
    if (winner === 'mafia') {
      victoryPrompt = `EVIL VICTORY - ${killerType} Win!
How they won: ${winCondition}
The ${killerType} have successfully eliminated or gained control over the community.

Generate a compelling conclusion (2-3 sentences) that:
- Shows how the ${killerType} achieved their dark victory
- References the original story's atmosphere and setting
- Conveys the tragic triumph of evil over good
- Maintains the tone established in the opening`;
    } else if (winner === 'villagers') {
      victoryPrompt = `GOOD VICTORY - Villagers Win!
How they won: ${winCondition}
The community has successfully identified and eliminated all the ${killerType}.

Generate a compelling conclusion (2-3 sentences) that:
- Shows how the villagers overcame the threat through courage and unity
- References the original story's atmosphere and setting
- Conveys hope restored after surviving the nightmare
- Honors those who were lost in the struggle
- Maintains the tone established in the opening`;
    }

    const contextPrompt = `You are concluding a story you previously created. Write the final chapter that brings the narrative to a satisfying close.

ORIGINAL STORY:
${originalStory}
${historyText}
${survivorsText}

GAME CONCLUSION:
${victoryPrompt}`;

    console.log(`🔮 Host: Preparing ${name} API call for end game story...`);
    console.log(`📝 Host: End game prompt length: ${contextPrompt.length} chars`);
    console.log(`🏁 Host: Generating ${winner} victory story for ${gameTheme} theme`);
    
    console.log(`\n📜 FULL END GAME PROMPT SENT TO ${name.toUpperCase()}:`);
    console.log('='.repeat(80));
    console.log(contextPrompt);
    console.log('='.repeat(80));
    console.log('');

    switch (name) {
      case 'venice':
        return await this.callVenice(config, contextPrompt);
      case 'openai':
        return await this.callOpenAI(config, contextPrompt);
      case 'anthropic':
        return await this.callAnthropic(config, contextPrompt);
      case 'ollama':
        return await this.callOllama(config, contextPrompt);
      default:
        throw new Error(`Unsupported provider: ${name}`);
    }
  }
}

// Create singleton instance
export const storyGenerationService = new StoryGenerationService(); 