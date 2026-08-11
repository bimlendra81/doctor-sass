import { gql } from "@apollo/client";

export const PRESCRIPTION_FIELDS = gql`
  fragment PrescriptionFields on Prescription {
    id
    status
    scriptNo
    issuedAt
    notes
    voidReason
    createdAt
    patient {
      id
      name
      phone
    }
    doctor {
      id
      user {
        name
      }
    }
    items {
      id
      drugName
      dosage
      frequency
      duration
      instructions
      strength
      quantity
      refills
    }
  }
`;

export const PRESCRIPTIONS_QUERY = gql`
  query Prescriptions($patientId: ID, $doctorId: ID, $status: PrescriptionStatus) {
    prescriptions(patientId: $patientId, doctorId: $doctorId, status: $status) {
      ...PrescriptionFields
    }
  }
  ${PRESCRIPTION_FIELDS}
`;

export const PRESCRIPTION_QUERY = gql`
  query Prescription($id: ID!) {
    prescription(id: $id) {
      ...PrescriptionFields
    }
  }
  ${PRESCRIPTION_FIELDS}
`;

export const PATIENTS_QUERY = gql`
  query Patients($search: String, $page: Int, $pageSize: Int) {
    patients(search: $search, page: $page, pageSize: $pageSize) {
      items {
        id
        name
        phone
      }
    }
  }
`;

export const DOCTORS_QUERY = gql`
  query Doctors {
    doctors {
      id
      user {
        id
        name
      }
    }
  }
`;

export const DRUG_SEARCH_QUERY = gql`
  query DrugSearch($q: String!, $limit: Int) {
    drugSearch(q: $q, limit: $limit) {
      id
      name
      category
      strength
    }
  }
`;

export const CREATE_PRESCRIPTION_MUTATION = gql`
  mutation CreatePrescription($input: CreatePrescriptionInput!) {
    createPrescription(input: $input) {
      ...PrescriptionFields
    }
  }
  ${PRESCRIPTION_FIELDS}
`;

export const UPDATE_PRESCRIPTION_MUTATION = gql`
  mutation UpdatePrescription($id: ID!, $input: UpdatePrescriptionInput!) {
    updatePrescription(id: $id, input: $input) {
      ...PrescriptionFields
    }
  }
  ${PRESCRIPTION_FIELDS}
`;

export const ISSUE_PRESCRIPTION_MUTATION = gql`
  mutation IssuePrescription($id: ID!) {
    issuePrescription(id: $id) {
      ...PrescriptionFields
    }
  }
  ${PRESCRIPTION_FIELDS}
`;

export const VOID_PRESCRIPTION_MUTATION = gql`
  mutation VoidPrescription($id: ID!, $reason: String!) {
    voidPrescription(id: $id, reason: $reason) {
      ...PrescriptionFields
    }
  }
  ${PRESCRIPTION_FIELDS}
`;
