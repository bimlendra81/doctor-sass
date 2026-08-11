import { gql } from "@apollo/client";

export const SUBSCRIPTION_INFO_QUERY = gql`
  query SubscriptionInfo {
    subscriptionInfo {
      plan
      subscriptionStatus
      limits {
        patients
        appointmentsPerDay
        features {
          prescriptions
          invoices
        }
      }
      usage {
        patients
        appointmentsToday
      }
    }
  }
`;

export const CREATE_CHECKOUT_MUTATION = gql`
  mutation CreateCheckout($plan: Plan!) {
    createCheckoutSession(plan: $plan) {
      url
      devMode
    }
  }
`;
