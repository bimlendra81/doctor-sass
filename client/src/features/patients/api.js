import { gql } from "@apollo/client";

export const PATIENT_FIELDS = gql`
  fragment PatientFields on Patient {
    id
    name
    email
    phone
    dob
    gender
    bloodGroup
    address
  }
`;

export const PATIENTS_QUERY = gql`
  query Patients($search: String, $page: Int, $pageSize: Int) {
    patients(search: $search, page: $page, pageSize: $pageSize) {
      total
      page
      pageSize
      items {
        ...PatientFields
      }
    }
  }
  ${PATIENT_FIELDS}
`;

export const CREATE_PATIENT_MUTATION = gql`
  mutation CreatePatient($input: CreatePatientInput!) {
    createPatient(input: $input) {
      ...PatientFields
    }
  }
  ${PATIENT_FIELDS}
`;

export const UPDATE_PATIENT_MUTATION = gql`
  mutation UpdatePatient($id: ID!, $input: UpdatePatientInput!) {
    updatePatient(id: $id, input: $input) {
      ...PatientFields
    }
  }
  ${PATIENT_FIELDS}
`;

export const DELETE_PATIENT_MUTATION = gql`
  mutation DeletePatient($id: ID!) {
    deletePatient(id: $id)
  }
`;

export const PATIENT_INVITE_MUTATION = gql`
  mutation PatientInvite($patientId: ID!, $email: String!) {
    patientInvite(patientId: $patientId, email: $email) {
      inviteToken
      user {
        id
        email
      }
      patient {
        id
        name
      }
    }
  }
`;
