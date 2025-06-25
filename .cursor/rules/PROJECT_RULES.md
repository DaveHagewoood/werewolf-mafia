# Project Rules & Development Guidelines

## Testing & Development Rules

### ❌ Rule 1: Do Not Test Locally
**Why**: The application URLs are hard-coded for deployment environments, which can cause conflicts and issues when testing locally.

**Impact**:
- Hard-coded URLs may point to production/staging servers
- Local testing may interfere with live deployments
- Socket connections may attempt to connect to wrong endpoints
- Authentication and routing may not work as expected locally

**What to do instead**:
- Use deployed development/staging environments for testing
- Test changes through deployment pipeline via Render.com
- Use console logging and state inspection for debugging
- Verify syntax and logic through code review before deployment

**Exceptions**:
- Syntax checking with `node -c filename.js` is safe
- Running isolated unit tests that don't start servers
- Code analysis and static testing

### ✅ Preferred Testing Approach
1. **Syntax Validation**: Use `node -c` to check syntax
2. **Code Review**: Review logic and implementation  
3. **Git Push**: Push changes to main branch
4. **Auto-Deploy**: Render.com automatically deploys from git push
5. **Test on Render**: Test functionality in deployed Render.com environment
6. **Monitor Logs**: Use Render.com server logs and state inspection for debugging
7. **Incremental Changes**: Make small changes to minimize deployment risk

### 🚀 Deployment Process
**Platform**: Render.com
**Trigger**: Automatic deployment on git push to main branch
**Workflow**:
1. Make code changes locally
2. Test syntax with `node -c filename.js`
3. Commit changes to git
4. Push to main branch: `git push origin main`
5. Render.com automatically detects push and deploys
6. Test functionality on deployed Render.com URLs
7. Monitor Render.com logs for any issues

## Architecture Rules

### Rule 2: Pure State-Based Architecture
- Clients should interpret state, not react to individual events
- If information is in the state, don't send it as a separate event
- Make incremental changes with thorough testing

### Rule 3: Backward Compatibility During Transitions
- Keep existing event handlers working until replacements are confirmed
- Use feature flags if needed for gradual rollout
- Test each change thoroughly before removing old code

## Development Workflow Rules

### Rule 4: Small, Incremental Changes
- Make one small change at a time
- Test thoroughly after each change
- Document what was changed and why
- Update progress tracking documents

### Rule 5: Comprehensive Documentation
- Update implementation plans when changes are made
- Document architectural decisions and rationale
- Keep progress summaries current
- Update API documentation when interfaces change

## Code Quality Rules

### Rule 6: Server-Side Logic Centralization
- All game state calculations should happen server-side
- Clients should not perform game logic calculations
- Use helper functions for complex state derivations

### Rule 7: Error Handling and Logging
- Add comprehensive error handling for all state changes
- Use descriptive console logging for debugging
- Include context in error messages

---

**Last Updated**: [Current Date]
**Status**: Active - All developers must follow these rules 