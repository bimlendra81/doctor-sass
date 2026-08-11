import { gql } from "@apollo/client";

export const CLINIC_SETTINGS_FIELDS = gql`
  fragment ClinicSettingsFields on ClinicSettings {
    id
    name
    subdomain
    timezone
    brandName
    logoUrl
    contactEmail
    contactPhone
    currency
    plan
    subscriptionStatus
  }
`;

export const CLINIC_SETTINGS_QUERY = gql`
  query ClinicSettings {
    clinicSettings {
      ...ClinicSettingsFields
    }
  }
  ${CLINIC_SETTINGS_FIELDS}
`;

export const UPDATE_CLINIC_SETTINGS_MUTATION = gql`
  mutation UpdateClinicSettings($input: UpdateClinicSettingsInput!) {
    updateClinicSettings(input: $input) {
      settings {
        ...ClinicSettingsFields
      }
    }
  }
  ${CLINIC_SETTINGS_FIELDS}
`;
