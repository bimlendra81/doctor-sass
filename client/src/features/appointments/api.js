import { gql } from "@apollo/client";

export const APPOINTMENT_FIELDS = gql`
  fragment AppointmentFields on Appointment {
    id
    startTime
    endTime
    status
    type
    note
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
  }
`;

export const DOCTORS_QUERY = gql`
  query Doctors {
    doctors {
      id
      specialization
      user {
        id
        name
        email
      }
    }
  }
`;

export const DOCTOR_SLOTS_QUERY = gql`
  query DoctorSlots($doctorId: ID!, $date: String!) {
    doctorSlots(doctorId: $doctorId, date: $date) {
      startTime
      endTime
      booked
      appointmentId
      status
    }
  }
`;

export const DOCTOR_AVAILABILITY_QUERY = gql`
  query DoctorAvailability($doctorId: ID!) {
    doctorAvailability(doctorId: $doctorId) {
      weekly {
        id
        dayOfWeek
        startTime
        endTime
        slotDuration
      }
      overrides {
        id
        doctorId
        date
        startTime
        endTime
        reason
      }
    }
  }
`;

export const APPOINTMENTS_QUERY = gql`
  query Appointments($doctorId: ID, $date: String, $status: AppointmentStatus) {
    appointments(doctorId: $doctorId, date: $date, status: $status) {
      ...AppointmentFields
    }
  }
  ${APPOINTMENT_FIELDS}
`;

export const DASHBOARD_QUERY = gql`
  query Dashboard($date: String) {
    dashboard(date: $date) {
      date
      total
      byStatus {
        status
        count
      }
    }
  }
`;

export const BOOK_APPOINTMENT_MUTATION = gql`
  mutation BookAppointment($input: BookAppointmentInput!) {
    bookAppointment(input: $input) {
      ...AppointmentFields
    }
  }
  ${APPOINTMENT_FIELDS}
`;

export const CONFIRM_APPOINTMENT_MUTATION = gql`
  mutation ConfirmAppointment($id: ID!) {
    confirmAppointment(id: $id) {
      id
      status
    }
  }
`;

export const COMPLETE_APPOINTMENT_MUTATION = gql`
  mutation CompleteAppointment($id: ID!) {
    completeAppointment(id: $id) {
      id
      status
    }
  }
`;

export const CANCEL_APPOINTMENT_MUTATION = gql`
  mutation CancelAppointment($id: ID!, $cancelReason: String) {
    cancelAppointment(id: $id, cancelReason: $cancelReason) {
      id
      status
    }
  }
`;

export const MARK_NO_SHOW_MUTATION = gql`
  mutation MarkNoShow($id: ID!) {
    markNoShow(id: $id) {
      id
      status
    }
  }
`;

export const SET_AVAILABILITY_MUTATION = gql`
  mutation SetAvailability($input: AvailabilityInput!) {
    setAvailability(input: $input) {
      id
      dayOfWeek
      startTime
      endTime
      slotDuration
    }
  }
`;

export const DELETE_AVAILABILITY_MUTATION = gql`
  mutation DeleteAvailability($dayOfWeek: Int!) {
    deleteAvailability(dayOfWeek: $dayOfWeek)
  }
`;

export const CREATE_SCHEDULE_OVERRIDE_MUTATION = gql`
  mutation CreateScheduleOverride($input: ScheduleOverrideInput!) {
    createScheduleOverride(input: $input) {
      id
      doctorId
      date
      startTime
      endTime
      reason
    }
  }
`;

export const DELETE_SCHEDULE_OVERRIDE_MUTATION = gql`
  mutation DeleteScheduleOverride($id: ID!) {
    deleteScheduleOverride(id: $id)
  }
`;
