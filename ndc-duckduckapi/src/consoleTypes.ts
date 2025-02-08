export type DDNConnectorEndpointsConfigV1 = {
  version: 1;
  jobs: Array<{
    id: string;
    title: string;
    functions: {
      status: {
        functionTag: string;
      };
    };
    oauthProviders: Array<{
      id: string;
      template: string;
      oauthCodeLogin: {
        functionTag: string;
      };
      oauthDetails: {
        clientId: string;
        scopes: string;
        pkceRequired?: boolean;
        authorizationEndpoint?: string;
      };
    }>;
  }>;
};

export type DDNConfigResponseV1 = {
  version: 1;
  config: string;
};

export type DDNJobStatusV1 = {
  ok: boolean;
  message: string;
};

export type DDNOAuthProviderCodeLoginRequestV1 = {
  code: string;
  tokenEndpoint: string;
  codeVerifier?: string;
  redirectUri: string;
};
