export async function exchangeOAuthCodeForToken(req: {
  code: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  codeVerifier?: string;
  redirectUri: string;
}) {
  const params = new URLSearchParams();
  params.append("grant_type", "authorization_code");
  params.append("code", req.code);
  params.append("redirect_uri", req.redirectUri);
  params.append("client_id", req.clientId);

  if (req.clientSecret) {
    params.append("client_secret", req.clientSecret);
  }

  if (req.codeVerifier) {
    params.append("code_verifier", req.codeVerifier);
  }

  try {
    if (!req.tokenEndpoint) {
      throw new Error("tokenEndpoint is empty");
    }

    const response = await fetch(req.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });

    if (!response.ok) {
      throw new Error("Failed to exchange code for token");
    }

    const data: any = await response.json();
    return data;
    // return {
    //   accessToken: data.access_token,
    //   refreshToken: data?.refresh_token,
    //   expiresIn: data?.expires_in,
    // };
  } catch (error) {
    throw error;
  }
}
