// lib/email/emailCases.js

const yellowColor = '#ffaa1d';
const greenColor = '#3cb371';
const blueColor = '#308cfc';
const redColor = '#d1001f';

const emailCases = {
  // 1. Role Change
  role_change: {
    template: 'role_change',
    subject: 'Your Role Has Been Changed',
    color: yellowColor,
    icon_cid: 'warning',
    icon_alt: 'Warning',
    title: 'Role Changed',
    requiresQr: false
  },

  // 2. Reservation Request Accept
  reservation_request_accept: {
    template: 'reservation_request_accept',
    subject: 'Your order has been accepted and reserved',
    color: greenColor,
    icon_cid: 'checked',
    icon_alt: 'checked',
    title: 'Order accepted',
    requiresQr: true // If pass 'qrLink', we'll embed a QR code
  },

  // 3. Reservation Request Pending
  reservation_request_pending: {
    template: 'reservation_request_pending',
    subject: 'Your order has been successfully placed',
    color: blueColor,
    icon_cid: 'information',
    icon_alt: 'information',
    title: 'Successfully Place Order',
    requiresQr: false
  },

  // 4. Reservation Request Reject
  reservation_request_reject: {
    template: 'reservation_request_reject',
    subject: 'Your order has been rejected',
    color: redColor, 
    icon_cid: 'wrong',
    icon_alt: 'wrong',
    title: 'Order Rejected',
    requiresQr: false
  },

  // 5. Register Pending
  register_pending: {
    template: 'register_pending',
    subject: 'You have successfully placed a request to create an account',
    color: blueColor, 
    icon_cid: 'information',
    icon_alt: 'information',
    title: 'Successfully Request Account',
    requiresQr: false
  },

  // 6. Register Accept
  register_accept: {
    template: 'register_accept',
    subject: 'You have successfully create an account',
    color: greenColor, 
    icon_cid: 'checked',
    icon_alt: 'checked',
    title: 'Successfully Register',
    requiresQr: false
  },

    // 6. Register Create
    register_create: {
      template: 'register_create',
      subject: 'You have successfully create an account',
      color: greenColor, 
      icon_cid: 'checked',
      icon_alt: 'checked',
      title: 'Successfully Create',
      requiresQr: false
    },

  // 7. Register Reject
  register_reject: {
    template: 'register_reject',
    subject: 'Your requested register account has been rejected',
    color: redColor, 
    icon_cid: 'wrong',
    icon_alt: 'wrong',
    title: 'Register Rejected',
    requiresQr: false
  },

    // 7. Register Reject
    ban_account: {
      template: 'ban_account',
      subject: 'Your account has been banned',
      color: redColor, 
      icon_cid: 'wrong',
      icon_alt: 'wrong',
      title: 'Account ban',
      requiresQr: false
    },

  // 8. Reservation Request Accept (Staff)
  reservation_request_accept_staff: {
    template: 'reservation_request_accept_staff',
    subject: 'You have successfully accept order',
    color: greenColor, 
    icon_cid: 'checked',
    icon_alt: 'checked',
    title: 'Successfully Accepted Delivery Order',
    requiresQr: false
  },

  // 9. Delivery Success
  delivery_success: {
    template: 'delivery_success',
    subject: 'Your order has been received',
    color: greenColor,
    icon_cid: 'checked',
    icon_alt: 'checked',
    title: 'Successfully Received',
    requiresQr: false
  },

  // 10. Delivery Success (Staff)
  delivery_success_staff: {
    template: 'delivery_success_staff',
    subject: 'You have successfully delivered your user order',
    color: greenColor, 
    icon_cid: 'checked',
    icon_alt: 'checked',
    title: 'Successfully Delivered',
    requiresQr: true // Typically staff get QR for the return day
  },

  // 11. Delivery Late
  delivery_late: {
    template: 'delivery_late',
    subject: 'Your order has been late received',
    color: yellowColor,
    icon_cid: 'warning',
    icon_alt: 'Warning',
    title: 'Late Recieved',
    requiresQr: false
  },

  // 12. Delivery Late (Staff)
  delivery_late_staff: {
    template: 'delivery_late_staff',
    subject: 'Your order have been late delivery',
    color: yellowColor,
    icon_cid: 'warning',
    icon_alt: 'Warning',
    title: 'Late Delivered',
    requiresQr: false
  },

  // 13. Delivery Late (Admin)
  delivery_late_admin: {
    template: 'delivery_late_admin',
    subject: 'The order have been late delivery',
    color: yellowColor,
    icon_cid: 'warning',
    icon_alt: 'Warning',
    title: 'Late Delivered',
    requiresQr: false
  },

  // 14. Return Success
  return_success: {
    template: 'return_success',
    subject: 'Confirmation of Successful Item Retrieval',
    color: greenColor,
    icon_cid: 'checked',
    icon_alt: 'checked',
    title: 'Successfully Retrieved',
    requiresQr: false
  },

  // 15. Return Success (Staff)
  return_success_staff: {
    template: 'return_success_staff',
    subject: 'Confirmation of Successful Item Retrieval',
    color: greenColor,
    icon_cid: 'checked',
    icon_alt: 'checked',
    title: 'Successfully Retrieved',
    requiresQr: false
  },

  // 16. Return Late
  return_late: {
    template: 'return_late',
    subject: 'Your order has been late retrieved',
    color: yellowColor,
    icon_cid: 'warning',
    icon_alt: 'Warning',
    title: 'Late Retrieved',
    requiresQr: false
  },

  // 17. Return Late (Staff)
  return_late_staff: {
    template: 'return_late_staff',
    subject: 'Your order have been late retrieved',
    color: yellowColor,
    icon_cid: 'warning',
    icon_alt: 'Warning',
    title: 'Late Retrieved',
    requiresQr: false
  },

  // 18. Return Late (Admin)
  return_late_admin: {
    template: 'return_late_admin',
    subject: 'The order have been late retrieved',
    color: yellowColor,
    icon_cid: 'warning',
    icon_alt: 'Warning',
    title: 'Late retrieved',
    requiresQr: false
  },

  // 19. Partner Account Create
  partner_account_create: {
    template: 'partner_account_create',
    subject: 'You have successfully create partner account',
    color: blueColor,
    icon_cid: 'information',
    icon_alt: 'information',
    title: 'Successfully Create Partner Account',
    requiresQr: false
  },

  // 20. Delete Account
  delete_account: {
    template: 'delete_account',
    subject: 'Your account have been deleted',
    color: redColor,
    icon_cid: 'wrong',
    icon_alt: 'wrong',
    title: 'Deleted Account',
    requiresQr: false
  },

  // 21. IPH Event Create
  iphevent_create: {
    template: 'iphevent_create',
    subject: 'IPH Event has been created',
    color: blueColor,
    icon_cid: 'information',
    icon_alt: 'information',
    title: 'Successfully Create IPH Event',
    requiresQr: false
  },


  otp_verification: {
    template: 'otp_verification',
    subject: 'Your OTP Code',
    color: blueColor,         
    icon_cid: 'information', 
    icon_alt: 'information',
    title: 'OTP Verification',
    requiresQr: false
  },

  register_otp_verification: {
    template: 'register_otp_verification',
    subject: 'Your OTP Code For Register',
    color: blueColor,         
    icon_cid: 'information', 
    icon_alt: 'information',
    title: 'OTP Verification',
    requiresQr: false
  },
  order_cancel_user: {
    template:'order_cancel_user',
    color: redColor,
    subject:'Your order has been canceled',
    icon_cid: 'wrong',
    title: 'Order has been canceled',
icon_alt: 'wrong',
    requiresQr:false
  },
  order_cancel_staff:{
    template:'order_cancel_staff',
    color: redColor,
    subject:'An order has been canceled',
    icon_cid: 'wrong',
    title: 'Order has been canceled',
icon_alt: 'wrong',
    requiresQr:false
  },
  slot_cancel_staff:{
    template:'slot_cancel_staff',
    color: redColor,
    subject:'Slot Canceled',
    icon_cid: 'wrong',
    title: 'Slot has been canceled',
icon_alt: 'wrong',
    requiresQr:false
  },
}

export default emailCases;