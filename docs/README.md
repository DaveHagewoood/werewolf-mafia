# Werewolf Mafia Game Documentation

Welcome to the documentation for the Werewolf Mafia multiplayer game project.

## 📁 Documentation Index

### Architecture & Design
- **[State-Based Architecture](./STATE_BASED_ARCHITECTURE.md)** - Comprehensive documentation of the state-based architecture implementation, including design goals, progress, and technical details.
- **[Pure State Implementation Plan](./PURE_STATE_IMPLEMENTATION_PLAN.md)** - Step-by-step plan for implementing pure state-based architecture with incremental changes.

### Technical Reference
- **[API Reference](./API_REFERENCE.md)** - Complete reference for server events, client events, and state structures.

### Development
- **[Project Rules](../.cursor/rules/PROJECT_RULES.md)** - Essential development rules and guidelines (READ FIRST!)
- **[Testing Guide](./TESTING_GUIDE.md)** - Testing strategies, test cases, and quality assurance procedures.
- **[Deployment Guide](./DEPLOYMENT_GUIDE.md)** - Step-by-step deployment instructions for different environments.

## 🎯 Project Overview

The Werewolf Mafia game is a multiplayer social deduction game built with:
- **Frontend**: React + Vite for both host and player applications
- **Backend**: Node.js + Socket.IO for real-time communication
- **Architecture**: State-based system with centralized game state management

## 🏗️ Architecture Summary

The game uses a **state-based architecture** where:
- **Host App**: Authoritative game controller with full state visibility
- **Player Apps**: Viewing clients that receive state updates
- **Server**: Centralized GameStateManager handling all state transitions
- **Communication**: Real-time WebSocket connections via Socket.IO

## 🚀 Quick Start

1. **Development Setup**: See `../DEV-SETUP.md`
2. **Architecture Understanding**: Read `STATE_BASED_ARCHITECTURE.md`
3. **API Integration**: Reference `API_REFERENCE.md`
4. **Testing**: Follow `TESTING_GUIDE.md`

## 📋 Current Status

### ✅ Completed
- Enhanced GameStateManager implementation
- State-based voting system
- Host-player state synchronization
- Reconnection handling improvements

### 🔄 In Progress
- Enhanced reconnection system with 90-second timeout
- State persistence and recovery
- Performance optimization

### 📅 Planned
- Comprehensive test suite
- Advanced reconnection features
- Game analytics and logging
- UI/UX improvements

## 🤝 Contributing

When contributing to this project:
1. Update relevant documentation in this folder
2. Follow the state-based architecture principles
3. Ensure backward compatibility during transitions
4. Add comprehensive error handling

## 📞 Support

For technical questions or issues:
1. Check the relevant documentation file
2. Review the architecture documentation
3. Examine the test cases for examples

---

**Last Updated**: [Current Date]
**Maintained By**: Development Team 