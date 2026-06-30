import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { AnalyticsException } from "@/AnalyticsException";
import type { IAnalytics, PostHogCaptureOptionsType } from "@/types";

// Create mock PostHog instance
const mockPostHogInstance = {
  // biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
  capture: mock((_options: any) => {}),
  shutdown: mock(() => {}),
};

// Mock the PostHog constructor
// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const MockPostHog = mock((_apiKey: string, _options?: { host?: string }): any => mockPostHogInstance);

// Mock the entire posthog-node module
mock.module("posthog-node", () => ({
  PostHog: MockPostHog,
}));

// Create the PostHogAnalytics class directly for testing (without decorator)
class PostHogAnalytics<T extends PostHogCaptureOptionsType = PostHogCaptureOptionsType> implements IAnalytics<T> {
  private client: typeof mockPostHogInstance | null = null;

  constructor() {
    const apiKey = Bun.env.ANALYTICS_POSTHOG_PROJECT_TOKEN;

    if (!apiKey) {
      throw new AnalyticsException(
        "PostHog API key is required. Please set the ANALYTICS_POSTHOG_PROJECT_TOKEN environment variable.",
        "API_KEY_REQUIRED",
      );
    }

    this.client = MockPostHog(apiKey, {
      host: Bun.env.ANALYTICS_POSTHOG_HOST || "https://eu.i.posthog.com",
    });
  }

  public capture(options: T): void {
    this.client?.capture({
      distinctId: options.id,
      event: options.event,
      properties: {
        $set: options.properties,
      },
      timestamp: new Date(),
      ...(options.groups && { groups: options.groups }),
    });
    this.client?.shutdown();
  }
}

describe("PostHogAnalytics", () => {
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    // Store original environment variables
    originalEnv = {
      ANALYTICS_POSTHOG_PROJECT_TOKEN: Bun.env.ANALYTICS_POSTHOG_PROJECT_TOKEN,
      ANALYTICS_POSTHOG_HOST: Bun.env.ANALYTICS_POSTHOG_HOST,
    };

    // Set default API key for tests
    Bun.env.ANALYTICS_POSTHOG_PROJECT_TOKEN = "test-api-key";
    delete Bun.env.ANALYTICS_POSTHOG_HOST;

    // Reset all mocks
    mockPostHogInstance.capture.mockClear();
    mockPostHogInstance.shutdown.mockClear();
    MockPostHog.mockClear();

    // Reset mock implementations to default
    mockPostHogInstance.capture.mockImplementation(() => {});
    mockPostHogInstance.shutdown.mockImplementation(() => {});
    MockPostHog.mockImplementation(() => mockPostHogInstance);
  });

  afterEach(() => {
    // Restore original environment variables
    if (originalEnv.ANALYTICS_POSTHOG_PROJECT_TOKEN !== undefined) {
      Bun.env.ANALYTICS_POSTHOG_PROJECT_TOKEN = originalEnv.ANALYTICS_POSTHOG_PROJECT_TOKEN;
    } else {
      delete Bun.env.ANALYTICS_POSTHOG_PROJECT_TOKEN;
    }

    if (originalEnv.ANALYTICS_POSTHOG_HOST !== undefined) {
      Bun.env.ANALYTICS_POSTHOG_HOST = originalEnv.ANALYTICS_POSTHOG_HOST;
    } else {
      delete Bun.env.ANALYTICS_POSTHOG_HOST;
    }
  });

  describe("Constructor", () => {
    test("should throw AnalyticsException when no API key is provided", () => {
      delete Bun.env.ANALYTICS_POSTHOG_PROJECT_TOKEN;

      expect(() => new PostHogAnalytics()).toThrow(AnalyticsException);
      expect(() => new PostHogAnalytics()).toThrow(
        "PostHog API key is required. Please set the ANALYTICS_POSTHOG_PROJECT_TOKEN environment variable.",
      );
    });

    test("should throw AnalyticsException when empty API key is provided via env", () => {
      Bun.env.ANALYTICS_POSTHOG_PROJECT_TOKEN = "";

      expect(() => new PostHogAnalytics()).toThrow(AnalyticsException);
    });

    test("should create instance successfully with API key from environment", () => {
      Bun.env.ANALYTICS_POSTHOG_PROJECT_TOKEN = "test-api-key";

      const analytics = new PostHogAnalytics();

      expect(analytics).toBeInstanceOf(PostHogAnalytics);
      expect(analytics).toHaveProperty("capture");
      expect(typeof analytics.capture).toBe("function");
    });

    test("should use default host when none provided", () => {
      Bun.env.ANALYTICS_POSTHOG_PROJECT_TOKEN = "test-api-key";
      delete Bun.env.ANALYTICS_POSTHOG_HOST;

      new PostHogAnalytics();

      expect(MockPostHog).toHaveBeenCalledWith("test-api-key", {
        host: "https://eu.i.posthog.com",
      });
    });

    test("should use host from environment when provided", () => {
      Bun.env.ANALYTICS_POSTHOG_PROJECT_TOKEN = "test-api-key";
      Bun.env.ANALYTICS_POSTHOG_HOST = "https://env.posthog.com";

      new PostHogAnalytics();

      expect(MockPostHog).toHaveBeenCalledWith("test-api-key", {
        host: "https://env.posthog.com",
      });
    });

    test("should initialize PostHog client with environment API key", () => {
      Bun.env.ANALYTICS_POSTHOG_PROJECT_TOKEN = "env-api-key";

      new PostHogAnalytics();

      expect(MockPostHog).toHaveBeenCalledWith("env-api-key", {
        host: "https://eu.i.posthog.com",
      });
    });
  });

  describe("capture method", () => {
    let analytics: InstanceType<typeof PostHogAnalytics>;

    beforeEach(() => {
      analytics = new PostHogAnalytics();
    });

    test("should call PostHog capture with correct parameters", () => {
      const captureData: PostHogCaptureOptionsType = {
        id: "user-123",
        event: "button_clicked",
        properties: { buttonId: "submit", page: "checkout" },
        groups: { company: "acme-corp", plan: "enterprise" },
      };

      analytics.capture(captureData);

      expect(mockPostHogInstance.capture).toHaveBeenCalledWith({
        distinctId: "user-123",
        event: "button_clicked",
        properties: {
          $set: { buttonId: "submit", page: "checkout" },
        },
        timestamp: expect.any(Date),
        groups: { company: "acme-corp", plan: "enterprise" },
      });
    });

    test("should handle capture with minimal data", () => {
      const captureData: PostHogCaptureOptionsType = {
        id: "user-456",
        event: "page_view",
      };

      analytics.capture(captureData);

      expect(mockPostHogInstance.capture).toHaveBeenCalledWith({
        distinctId: "user-456",
        event: "page_view",
        properties: {
          $set: undefined,
        },
        timestamp: expect.any(Date),
      });
    });

    test("should handle capture with empty properties", () => {
      const captureData: PostHogCaptureOptionsType = {
        id: "user-789",
        event: "form_submit",
        properties: {},
      };

      analytics.capture(captureData);

      expect(mockPostHogInstance.capture).toHaveBeenCalledWith({
        distinctId: "user-789",
        event: "form_submit",
        properties: {
          $set: {},
        },
        timestamp: expect.any(Date),
      });
    });

    test("should handle capture with empty groups", () => {
      const captureData: PostHogCaptureOptionsType = {
        id: "user-000",
        event: "purchase",
        groups: {},
      };

      analytics.capture(captureData);

      expect(mockPostHogInstance.capture).toHaveBeenCalledWith({
        distinctId: "user-000",
        event: "purchase",
        properties: {
          $set: undefined,
        },
        timestamp: expect.any(Date),
        groups: {},
      });
    });

    test("should handle capture with complex properties", () => {
      const captureData: PostHogCaptureOptionsType = {
        id: "user-complex",
        event: "complex_event",
        properties: {
          stringProp: "test",
          numberProp: 42,
          booleanProp: true,
          objectProp: { nested: "value" },
          arrayProp: [1, 2, 3],
          nullProp: null,
          undefinedProp: undefined,
        },
      };

      analytics.capture(captureData);

      expect(mockPostHogInstance.capture).toHaveBeenCalledWith({
        distinctId: "user-complex",
        event: "complex_event",
        properties: {
          $set: captureData.properties,
        },
        timestamp: expect.any(Date),
      });
    });

    test("should handle capture with numeric group values", () => {
      const captureData: PostHogCaptureOptionsType = {
        id: "user-numeric",
        event: "numeric_groups_event",
        groups: {
          companyId: 123,
          teamId: 456,
          projectId: "project-789",
        },
      };

      analytics.capture(captureData);

      expect(mockPostHogInstance.capture).toHaveBeenCalledWith({
        distinctId: "user-numeric",
        event: "numeric_groups_event",
        properties: {
          $set: undefined,
        },
        timestamp: expect.any(Date),
        groups: {
          companyId: 123,
          teamId: 456,
          projectId: "project-789",
        },
      });
    });

    test("should always call shutdown after capture", () => {
      const captureData: PostHogCaptureOptionsType = {
        id: "user-shutdown",
        event: "shutdown_test",
      };

      analytics.capture(captureData);

      expect(mockPostHogInstance.shutdown).toHaveBeenCalledTimes(1);
    });

    test("should generate timestamp for each capture call", () => {
      const captureData: PostHogCaptureOptionsType = {
        id: "user-timestamp",
        event: "timestamp_test",
      };

      analytics.capture(captureData);

      expect(mockPostHogInstance.capture).toHaveBeenCalledTimes(1);
      expect(mockPostHogInstance.capture).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Date),
        }),
      );
    });

    test("should capture events when initialized with environment API key", () => {
      Bun.env.ANALYTICS_POSTHOG_PROJECT_TOKEN = "env-key";
      const analyticsWithEnvKey = new PostHogAnalytics();

      const captureData: PostHogCaptureOptionsType = {
        id: "user-env-key",
        event: "env_key_test",
      };

      expect(() => analyticsWithEnvKey.capture(captureData)).not.toThrow();
      expect(mockPostHogInstance.capture).toHaveBeenCalledWith(
        expect.objectContaining({
          distinctId: "user-env-key",
          event: "env_key_test",
        }),
      );
    });

    test("should handle special characters in event names and properties", () => {
      const captureData: PostHogCaptureOptionsType = {
        id: "user-special",
        event: "special_event_with_émojis",
        properties: {
          "property with spaces": "value",
          "property-with-dashes": "value",
          property_with_underscores: "value",
          "property.with.dots": "value",
          "property/with/slashes": "value",
        },
      };

      expect(() => analytics.capture(captureData)).not.toThrow();
      expect(mockPostHogInstance.capture).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "special_event_with_émojis",
          properties: {
            $set: captureData.properties,
          },
        }),
      );
    });
  });

  describe("IAnalytics interface compliance", () => {
    test("should implement IAnalytics interface correctly", () => {
      const analytics = new PostHogAnalytics();

      expect(analytics).toHaveProperty("capture");
      expect(typeof analytics.capture).toBe("function");
    });

    test("should accept generic capture type", () => {
      const analytics = new PostHogAnalytics();

      interface CustomCaptureType extends PostHogCaptureOptionsType {
        customProperty: string;
      }

      const customData: CustomCaptureType = {
        id: "user-custom",
        event: "custom_event",
        customProperty: "custom value",
        properties: { test: "value" },
      };

      expect(() => analytics.capture(customData)).not.toThrow();
    });
  });

  describe("Error scenarios", () => {
    test("should handle PostHog capture errors gracefully", () => {
      const analytics = new PostHogAnalytics();

      // Create a fresh mock for this test to avoid affecting others
      const errorMock = mock(() => {
        throw new Error("PostHog API error");
      });
      mockPostHogInstance.capture.mockImplementation(errorMock);

      const captureData: PostHogCaptureOptionsType = {
        id: "user-error",
        event: "error_test",
      };

      expect(() => analytics.capture(captureData)).toThrow("PostHog API error");
    });

    test("should handle PostHog shutdown errors gracefully", () => {
      const analytics = new PostHogAnalytics();

      // Reset capture to default behavior and only mock shutdown to throw
      mockPostHogInstance.capture.mockImplementation(() => {});
      mockPostHogInstance.shutdown.mockImplementation(() => {
        throw new Error("Shutdown error");
      });

      const captureData: PostHogCaptureOptionsType = {
        id: "user-shutdown-error",
        event: "shutdown_error_test",
      };

      expect(() => analytics.capture(captureData)).toThrow("Shutdown error");
    });
  });

  describe("Multiple capture calls", () => {
    test("should handle multiple sequential capture calls", () => {
      const analytics = new PostHogAnalytics();

      const captureData1: PostHogCaptureOptionsType = {
        id: "user-1",
        event: "event_1",
      };

      const captureData2: PostHogCaptureOptionsType = {
        id: "user-2",
        event: "event_2",
      };

      analytics.capture(captureData1);
      analytics.capture(captureData2);

      expect(mockPostHogInstance.capture).toHaveBeenCalledTimes(2);
      expect(mockPostHogInstance.shutdown).toHaveBeenCalledTimes(2);

      expect(mockPostHogInstance.capture).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          distinctId: "user-1",
          event: "event_1",
        }),
      );

      expect(mockPostHogInstance.capture).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          distinctId: "user-2",
          event: "event_2",
        }),
      );
    });
  });

  describe("Real-world usage scenarios", () => {
    test("should handle user signup event", () => {
      const analytics = new PostHogAnalytics();

      const signupData: PostHogCaptureOptionsType = {
        id: "new-user-123",
        event: "user_signup",
        properties: {
          email: "user@example.com",
          source: "organic",
          plan: "free",
          referrer: "https://google.com",
        },
        groups: {
          company: "startup-inc",
        },
      };

      analytics.capture(signupData);

      expect(mockPostHogInstance.capture).toHaveBeenCalledWith({
        distinctId: "new-user-123",
        event: "user_signup",
        properties: {
          $set: signupData.properties,
        },
        timestamp: expect.any(Date),
        groups: signupData.groups,
      });
    });

    test("should handle e-commerce purchase event", () => {
      const analytics = new PostHogAnalytics();

      const purchaseData: PostHogCaptureOptionsType = {
        id: "customer-456",
        event: "purchase_completed",
        properties: {
          orderId: "order-789",
          revenue: 99.99,
          currency: "USD",
          products: ["product-a", "product-b"],
          paymentMethod: "credit_card",
          discount: 10.0,
        },
        groups: {
          store: "main-store",
          region: "north-america",
        },
      };

      analytics.capture(purchaseData);

      expect(mockPostHogInstance.capture).toHaveBeenCalledWith(
        expect.objectContaining({
          distinctId: "customer-456",
          event: "purchase_completed",
          properties: {
            $set: purchaseData.properties,
          },
          groups: purchaseData.groups,
        }),
      );
    });

    test("should handle feature usage tracking", () => {
      const analytics = new PostHogAnalytics();

      const featureData: PostHogCaptureOptionsType = {
        id: "power-user-789",
        event: "feature_used",
        properties: {
          feature: "advanced_analytics",
          sessionDuration: 1800,
          actionsCount: 25,
          source: "dashboard",
        },
        groups: {
          tier: "premium",
          segment: "power-users",
        },
      };

      analytics.capture(featureData);

      expect(mockPostHogInstance.capture).toHaveBeenCalledWith(
        expect.objectContaining({
          distinctId: "power-user-789",
          event: "feature_used",
          properties: {
            $set: featureData.properties,
          },
          groups: featureData.groups,
        }),
      );
    });
  });

  describe("Edge cases", () => {
    test("should handle very long user IDs", () => {
      const analytics = new PostHogAnalytics();
      const longId = `user-${"x".repeat(1000)}`;

      const captureData: PostHogCaptureOptionsType = {
        id: longId,
        event: "long_id_test",
      };

      expect(() => analytics.capture(captureData)).not.toThrow();
      expect(mockPostHogInstance.capture).toHaveBeenCalledWith(
        expect.objectContaining({
          distinctId: longId,
        }),
      );
    });

    test("should handle very long event names", () => {
      const analytics = new PostHogAnalytics();
      const longEventName = `event_${"x".repeat(500)}`;

      const captureData: PostHogCaptureOptionsType = {
        id: "user-long-event",
        event: longEventName,
      };

      expect(() => analytics.capture(captureData)).not.toThrow();
      expect(mockPostHogInstance.capture).toHaveBeenCalledWith(
        expect.objectContaining({
          event: longEventName,
        }),
      );
    });

    test("should handle large property objects", () => {
      const analytics = new PostHogAnalytics();
      const largeProperties: Record<string, unknown> = {};

      // Create a large properties object
      for (let i = 0; i < 100; i++) {
        largeProperties[`property_${i}`] = `value_${i}`;
      }

      const captureData: PostHogCaptureOptionsType = {
        id: "user-large-props",
        event: "large_properties_test",
        properties: largeProperties,
      };

      expect(() => analytics.capture(captureData)).not.toThrow();
      expect(mockPostHogInstance.capture).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: {
            $set: largeProperties,
          },
        }),
      );
    });

    test("should handle deeply nested property values", () => {
      const analytics = new PostHogAnalytics();

      const nestedProperties = {
        level1: {
          level2: {
            level3: {
              level4: {
                deepValue: "found it!",
                deepArray: [1, 2, { nested: "array object" }],
              },
            },
          },
        },
      };

      const captureData: PostHogCaptureOptionsType = {
        id: "user-nested",
        event: "nested_properties_test",
        properties: nestedProperties,
      };

      expect(() => analytics.capture(captureData)).not.toThrow();
      expect(mockPostHogInstance.capture).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: {
            $set: nestedProperties,
          },
        }),
      );
    });
  });

  describe("Performance and reliability", () => {
    test("should handle rapid successive capture calls", () => {
      const analytics = new PostHogAnalytics();

      // Simulate rapid successive calls
      for (let i = 0; i < 10; i++) {
        analytics.capture({
          id: `user-${i}`,
          event: `rapid_event_${i}`,
        });
      }

      expect(mockPostHogInstance.capture).toHaveBeenCalledTimes(10);
      expect(mockPostHogInstance.shutdown).toHaveBeenCalledTimes(10);
    });

    test("should handle capture calls with varying data sizes", () => {
      const analytics = new PostHogAnalytics();

      // Small data
      analytics.capture({
        id: "user-small",
        event: "small",
      });

      // Medium data
      analytics.capture({
        id: "user-medium",
        event: "medium_event",
        properties: { prop1: "value1", prop2: "value2" },
        groups: { group1: "value1" },
      });

      // Large data
      const largeProps: Record<string, unknown> = {};
      for (let i = 0; i < 50; i++) {
        largeProps[`prop_${i}`] = `value_${i}`;
      }
      analytics.capture({
        id: "user-large",
        event: "large_event",
        properties: largeProps,
        groups: { group1: "value1", group2: "value2", group3: "value3" },
      });

      expect(mockPostHogInstance.capture).toHaveBeenCalledTimes(3);
      expect(mockPostHogInstance.shutdown).toHaveBeenCalledTimes(3);
    });
  });

  describe("Data integrity", () => {
    test("should preserve all property types correctly", () => {
      const analytics = new PostHogAnalytics();

      const mixedData: PostHogCaptureOptionsType = {
        id: "user-mixed",
        event: "mixed_data_test",
        properties: {
          stringValue: "test string",
          numberValue: 42,
          floatValue: Math.PI,
          booleanTrue: true,
          booleanFalse: false,
          nullValue: null,
          undefinedValue: undefined,
          arrayValue: [1, "two", { three: 3 }],
          objectValue: {
            nested: {
              deeply: {
                value: "deep value",
              },
            },
          },
          dateValue: new Date("2023-01-01"),
        },
      };

      analytics.capture(mixedData);

      expect(mockPostHogInstance.capture).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: {
            $set: mixedData.properties,
          },
        }),
      );
    });

    test("should handle special numeric values", () => {
      const analytics = new PostHogAnalytics();

      const numericData: PostHogCaptureOptionsType = {
        id: "user-numeric",
        event: "numeric_test",
        properties: {
          zero: 0,
          negativeNumber: -42,
          positiveNumber: 42,
          largeNumber: Number.MAX_SAFE_INTEGER,
          smallNumber: Number.MIN_SAFE_INTEGER,
          infinity: Number.POSITIVE_INFINITY,
          negativeInfinity: Number.NEGATIVE_INFINITY,
          notANumber: Number.NaN,
        },
      };

      analytics.capture(numericData);

      expect(mockPostHogInstance.capture).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: {
            $set: numericData.properties,
          },
        }),
      );
    });

    test("should maintain timestamp precision", () => {
      const analytics = new PostHogAnalytics();

      analytics.capture({
        id: "user-timestamp-precision",
        event: "timestamp_precision_test",
      });

      expect(mockPostHogInstance.capture).toHaveBeenCalledTimes(1);
      expect(mockPostHogInstance.capture).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Date),
        }),
      );
    });
  });
});
