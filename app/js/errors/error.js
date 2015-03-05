'use strict';
/*
 * Copyright 2013 Next Century Corporation
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

var error = error || {};

error.UNKNOWN_ERROR_MESSAGE = "An error occurred.";

// Customize the error message that is shown based on the error code returned by the neon-server.
error.ERROR_CODE_TO_MESSAGE = {
    // aggregation result exceeds maximum document size (16MB)
    "16389": "Query execution failed because there was too much data."
};

// Store the stack trace text for each individual error so we don't have to insert it into the HTML.
// We'll delete it when we're finished with it.
error.STACK_TRACE_STORAGE = {};
error.STACK_TRACE_NEXT_INDEX = 1;

$.notify.addStyle("error", {
    html:
        // The first div gets reclassed by notifyjs.
        "<div>" +
            // Store the stack trace index corresponding to this error.
            "<span data-notify-text='index' class='index hidden'></span>" +
            // Add the notifyjs bootstrap styling.
            "<div class='notifyjs-bootstrap-base notifyjs-bootstrap-error'>" +
                "<div class='message' data-notify-text='message'/>" +
                "<div class='buttons'>" +
                    "<button class='btn btn-default pull-right' onclick=\"error.showStackTraceNotification_(this.parentElement.parentElement.parentElement);\">" +
                        "Details" +
                    "</button>" +
                    "<button class='btn btn-default pull-right' onclick=\"error.hideErrorNotification_(this.parentElement.parentElement.parentElement);\">" +
                        "OK" +
                    "</button>" +
                    "<div class='clearfix'></div>" +
                "</div>" +
            "</div>" +
        "</div>"
});

$.notify.addStyle("stacktrace", {
    html:
        // The first div gets reclassed by notifyjs.
        "<div>" +
            // Add the notifyjs bootstrap styling.
            "<div class='notifyjs-bootstrap-base notifyjs-bootstrap-error'>" +
                "<div class='stacktrace well' data-notify-html='stacktrace'/>" +
            "</div>" +
        "</div>"
});

/**
 * Shows an error message popup for the given parameters.
 * @param {HTMLElement} The notification will be displayed next to this element.
 * @param {Integer} The error code corresponding to the error message that will be displayed.
 * @param {String} The error stack trace.
 * @return The jQuery element for the error message.
 */
error.showErrorMessage = function(htmlElement, errorCode, stackTrace) {
    var jqueryElement = $(htmlElement);

    var message = error.ERROR_CODE_TO_MESSAGE[errorCode] ? error.ERROR_CODE_TO_MESSAGE[errorCode] : error.UNKNOWN_ERROR_MESSAGE;
    var index = error.STACK_TRACE_NEXT_INDEX++;
    error.STACK_TRACE_STORAGE[index] = stackTrace;

    // Show a temporary notification in the corner of the dashboard.
    $.notify(message);

    // Show a notification in the visualization itself.
    $.notify(jqueryElement, {
        message: message,
        index: index
    }, {
        style: "error",
        clickToHide: false,
        autoHide: false,
        arrowShow: false
    });

    // The notification is added as a sibling to the input element.
    var errorNotification = jqueryElement.parent().find(".notifyjs-error-base");

    error.resizeErrorNotification_(jqueryElement, errorNotification);

    return errorNotification;
};

error.resizeErrorNotification_ = function(jqueryElement, errorNotification) {
    var errorNotificationContainer = errorNotification.parent();

    // Resize the notification so its width matches the jqueryElement.  Do this before calculating its height due to wrapping.
    var cssWidth = jqueryElement.outerWidth(true);
    errorNotificationContainer.css("width", cssWidth + "px");

    // The notifyjs container element is hidden until its animation finishes so use its child to get its dimensions.
    var cssTop = jqueryElement.outerHeight(true) - errorNotification.outerHeight(true);

    // The 'top' style of the notifyjs container element gets set by notifyjs to position the notification outside the
    // bottom of the input element.  We instead want to position it inside the bottom of the input element.
    errorNotificationContainer.css("top", cssTop + "px");
};

/**
 * Hides the given error message popup and any associated stack trace popup.
 * @param {Object} The jQuery element for the error message.
 */
error.hideErrorMessage = function(errorNotification) {
    // Hide the corresponding stack trace notification first if it exists.
    var stackTraceNotification = errorNotification.parent().find(".notifyjs-stacktrace-base");
    stackTraceNotification.trigger("notify-hide");
    errorNotification.trigger("notify-hide");
}

error.hideErrorNotification_ = function(htmlElement) {
    error.hideErrorMessage($(htmlElement));
};

error.showStackTraceNotification_ = function(htmlElement) {
    var errorNotification = $(htmlElement);

    if(errorNotification.find(".notifyjs-stacktrace-base").length) {
        return;
    }

    var index = errorNotification.find(".index").html();
    var stackTrace = error.STACK_TRACE_STORAGE[index].replace(/\n/g, "<br/>").replace(/\t/g, "");

    // Position the stack trace notification directly below the error notification.
    $.notify(errorNotification.find(".notifyjs-bootstrap-base"), {
        stacktrace: stackTrace
    }, {
        style: "stacktrace",
        clickToHide: false,
        autoHide: false,
        arrowShow: false
    });

    error.resizeStackTraceNotification_(errorNotification);

    // Clean up to save a bit of memory space since we won't need the stored stack trace anymore.
    error.STACK_TRACE_STORAGE[index] = "";
};

error.resizeStackTraceNotification_ = function(errorNotification) {
    var stackTraceNotificationContainer = errorNotification.find(".notifyjs-stacktrace-base").parent();

    // Resize the stack trace message so its width matches the error message.
    var cssWidth = errorNotification.find(".message").width();
    stackTraceNotificationContainer.find(".well").css("width", cssWidth + "px");

    // Ensure the stack trace notification is positioned directly below the error notification.
    // This is relevant if resizing the widget causes the error notification to change in height.
    var cssTop = errorNotification.height() + 5;
    stackTraceNotificationContainer.css("top", cssTop + "px");
};

/**
 * Resizes the error message popup and any associated stack trace popup.
 * @param {HTMLElement} The resized element associated with the error message.
 * @param {Object} The jQuery element for the error message.
 */
error.resizeErrorMessage = function(htmlElement, errorNotification) {
    error.resizeErrorNotification_($(htmlElement), errorNotification);
    error.resizeStackTraceNotification_(errorNotification);
};
