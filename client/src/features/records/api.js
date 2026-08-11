import { gql } from "@apollo/client";

export const RECORD_FIELDS = gql`
  fragment RecordFields on MedicalRecord {
    id
    clinicId
    patientId
    doctorId
    type
    title
    notes
    fileKey
    fileName
    mimeType
    sizeBytes
    createdAt
    updatedAt
  }
`;

export const RECORDS_QUERY = gql`
  query Records($patientId: ID, $type: RecordType, $page: Int, $pageSize: Int) {
    records(patientId: $patientId, type: $type, page: $page, pageSize: $pageSize) {
      total
      page
      pageSize
      items {
        ...RecordFields
      }
    }
  }
  ${RECORD_FIELDS}
`;

export const RECORD_FILE_URL_QUERY = gql`
  query RecordFileUrl($id: ID!) {
    recordFileUrl(id: $id) {
      url
      expiresAt
    }
  }
`;

export const RECORD_UPLOAD_URL_MUTATION = gql`
  mutation RecordUploadUrl($patientId: ID!, $fileName: String!, $mimeType: String!) {
    recordUploadUrl(patientId: $patientId, fileName: $fileName, mimeType: $mimeType) {
      url
      method
      fileKey
      expiresAt
    }
  }
`;

export const CREATE_RECORD_MUTATION = gql`
  mutation CreateRecord($input: CreateRecordInput!) {
    createRecord(input: $input) {
      ...RecordFields
    }
  }
  ${RECORD_FIELDS}
`;

export const UPDATE_RECORD_MUTATION = gql`
  mutation UpdateRecord($id: ID!, $input: UpdateRecordInput!) {
    updateRecord(id: $id, input: $input) {
      ...RecordFields
    }
  }
  ${RECORD_FIELDS}
`;

export const DELETE_RECORD_MUTATION = gql`
  mutation DeleteRecord($id: ID!) {
    deleteRecord(id: $id)
  }
`;
