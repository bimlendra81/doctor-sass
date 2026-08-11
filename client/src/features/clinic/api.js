import { gql } from "@apollo/client";
import { USER_FIELDS } from "../auth/api.js";

export const CREATE_CLINIC_MUTATION = gql`
  mutation CreateClinic($input: CreateClinicInput!) {
    createClinic(input: $input) {
      clinic {
        id
        name
        subdomain
        plan
        subscriptionStatus
        createdAt
      }
      user {
        ...UserFields
      }
      accessToken
      refreshToken
    }
  }
  ${USER_FIELDS}
`;

export const CLINIC_QUERY = gql`
  query Clinic {
    clinic {
      id
      name
      subdomain
      plan
      subscriptionStatus
    }
  }
`;

export const CLINIC_USERS_QUERY = gql`
  query ClinicUsers {
    clinicUsers {
      id
      name
      email
      role
    }
  }
`;

export const INVITE_STAFF_MUTATION = gql`
  mutation InviteStaff($input: InviteInput!) {
    inviteStaff(input: $input) {
      inviteToken
      user {
        id
        name
        email
        role
      }
    }
  }
`;
