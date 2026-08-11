import { gql } from "@apollo/client";

export const NOTIFICATION_FIELDS = gql`
  fragment NotificationFields on Notification {
    id
    clinicId
    userId
    type
    title
    body
    isRead
    createdAt
  }
`;

export const MY_NOTIFICATIONS_QUERY = gql`
  query MyNotifications($unreadOnly: Boolean, $page: Int, $pageSize: Int) {
    myNotifications(unreadOnly: $unreadOnly, page: $page, pageSize: $pageSize) {
      total
      page
      pageSize
      items {
        ...NotificationFields
      }
    }
  }
  ${NOTIFICATION_FIELDS}
`;

export const UNREAD_COUNT_QUERY = gql`
  query UnreadNotificationCount {
    unreadNotificationCount
  }
`;

export const MY_PREFERENCES_QUERY = gql`
  query MyNotificationPreferences {
    myNotificationPreferences {
      channel
      enabled
    }
  }
`;

export const MARK_READ_MUTATION = gql`
  mutation MarkNotificationRead($id: ID!) {
    markNotificationRead(id: $id) {
      ...NotificationFields
    }
  }
  ${NOTIFICATION_FIELDS}
`;

export const MARK_ALL_READ_MUTATION = gql`
  mutation MarkAllNotificationsRead {
    markAllNotificationsRead
  }
`;

export const SET_PREFERENCE_MUTATION = gql`
  mutation SetNotificationPreference($channel: String!, $enabled: Boolean!) {
    setNotificationPreference(channel: $channel, enabled: $enabled)
  }
`;
