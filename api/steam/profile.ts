import { handleProfileRequest } from '../../packages/core/src/steam/profile'

export default {
  fetch(request: Request) {
    return handleProfileRequest(request, { apiKey: process.env.STEAM_API_KEY })
  },
}
