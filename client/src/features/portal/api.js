import { gql } from "@apollo/client";

export const ACCEPT_PATIENT_INVITE_MUTATION = gql`
  mutation AcceptPatientInvite($input: AcceptPatientInviteInput!) {
    acceptPatientInvite(input: $input) {
      accessToken
      refreshToken
      user {
        id
        clinicId
        role
        name
        email
      }
    }
  }
`;

export const MY_PROFILE_QUERY = gql`
  query MyProfile {
    myProfile {
      id
      clinicId
      name
      email
      phone
      bloodGroup
    }
  }
`;

export const PORTAL_DOCTORS_QUERY = gql`
  query PortalDoctors {
    portalDoctors {
      id
      specialization
      user {
        id
        name
      }
    }
  }
`;

export const PORTAL_DOCTOR_SLOTS_QUERY = gql`
  query PortalDoctorSlots($doctorId: ID!, $date: String!) {
    portalDoctorSlots(doctorId: $doctorId, date: $date) {
      startTime
      endTime
      booked
      appointmentId
      status
    }
  }
`;

export const MY_APPOINTMENTS_QUERY = gql`
  query MyAppointments($status: AppointmentStatus, $page: Int, $pageSize: Int) {
    myAppointments(status: $status, page: $page, pageSize: $pageSize) {
      total
      page
      pageSize
      items {
        id
        startTime
        endTime
        status
        type
        note
        doctor {
          id
          user {
            name
          }
        }
      }
    }
  }
`;

export const BOOK_MY_APPOINTMENT_MUTATION = gql`
  mutation BookMyAppointment($input: BookMyAppointmentInput!) {
    bookMyAppointment(input: $input) {
      id
      startTime
      endTime
      status
      type
      note
    }
  }
`;

export const CANCEL_MY_APPOINTMENT_MUTATION = gql`
  mutation CancelMyAppointment($id: ID!, $cancelReason: String) {
    cancelMyAppointment(id: $id, cancelReason: $cancelReason) {
      id
      status
    }
  }
`;

export const MY_PRESCRIPTIONS_QUERY = gql`
  query MyPrescriptions {
    myPrescriptions {
      id
      status
      scriptNo
      issuedAt
      notes
      createdAt
      doctor {
        user {
          name
        }
      }
      items {
        id
        drugName
        strength
        dosage
        frequency
        duration
        quantity
        refills
      }
    }
  }
`;

export const MY_INVOICES_QUERY = gql`
  query MyInvoices {
    myInvoices {
      id
      invoiceNo
      subtotal
      tax
      total
      balanceDue
      currency
      status
      dueDate
      createdAt
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
        createdAt
      }
    }
  }
`;

export const PAY_INVOICE_MUTATION = gql`
  mutation PayInvoice($invoiceId: ID!) {
    payInvoice(invoiceId: $invoiceId) {
      invoice {
        id
        status
        balanceDue
        payments {
          id
          amount
          method
          createdAt
        }
      }
      devMode
      url
    }
  }
`;

export const MY_RECORDS_QUERY = gql`
  query MyRecords {
    myRecords {
      id
      type
      title
      notes
      fileName
      mimeType
      sizeBytes
      createdAt
    }
  }
`;

export const MY_RECORD_FILE_URL_QUERY = gql`
  query MyRecordFileUrl($id: ID!) {
    myRecordFileUrl(id: $id) {
      url
      expiresAt
    }
  }
`;
