import { gql } from "@apollo/client";

export const INVOICE_FIELDS = gql`
  fragment InvoiceFields on Invoice {
    id
    invoiceNo
    status
    subtotal
    tax
    total
    balanceDue
    currency
    dueDate
    voidReason
    createdAt
    patient {
      id
      name
      phone
    }
    items {
      id
      description
      qty
      unitPrice
      amount
    }
    payments {
      id
      amount
      method
      note
      createdAt
    }
  }
`;

export const INVOICES_QUERY = gql`
  query Invoices($patientId: ID, $status: InvoiceStatus, $date: String) {
    invoices(patientId: $patientId, status: $status, date: $date) {
      ...InvoiceFields
    }
  }
  ${INVOICE_FIELDS}
`;

export const INVOICE_QUERY = gql`
  query Invoice($id: ID!) {
    invoice(id: $id) {
      ...InvoiceFields
    }
  }
  ${INVOICE_FIELDS}
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

export const CREATE_INVOICE_MUTATION = gql`
  mutation CreateInvoice($input: CreateInvoiceInput!) {
    createInvoice(input: $input) {
      ...InvoiceFields
    }
  }
  ${INVOICE_FIELDS}
`;

export const RECORD_PAYMENT_MUTATION = gql`
  mutation RecordPayment($input: RecordPaymentInput!) {
    recordPayment(input: $input) {
      ...InvoiceFields
    }
  }
  ${INVOICE_FIELDS}
`;

export const VOID_INVOICE_MUTATION = gql`
  mutation VoidInvoice($id: ID!, $reason: String!) {
    voidInvoice(id: $id, reason: $reason) {
      ...InvoiceFields
    }
  }
  ${INVOICE_FIELDS}
`;
