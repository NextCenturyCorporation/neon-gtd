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

$.notify.addStyle("error", {
    html:
        // The first div gets reclassed by notifyjs.
        "<div>" +
            // Add the notifyjs bootstrap styling.
            "<div class='notifyjs-bootstrap-base notifyjs-bootstrap-error'>" +
                "<div class='message' data-notify-text='message'/>" +
                "<div class='buttons'>" +
                    "<button class='btn btn-default pull-right' onclick=\"error.toggleStacktrace_(this.parentElement.parentElement);\">" +
                        "Details" +
                    "</button>" +
                    "<button class='btn btn-default pull-right' onclick=\"error.hideError_(this.parentElement.parentElement);\">" +
                        "OK" +
                    "</button>" +
                    "<div class='clearfix'></div>" +
                "</div>" +
                "<div class='stacktrace well' data-notify-html='stacktrace' style='display: none;'></div>" +
            "</div>" +
        "</div>"
});

/**
 * Shows an error message popup for the given parameters.
 * @param {HTMLElement} The notification will be displayed next to this element.
 * @param {String} The error message that will be displayed in the notification.
 * @param {String} The error stack trace.
 * @return The jQuery element for the error message.
 */
error.showErrorMessage = function(htmlElement, message, stacktrace) {
    var jqueryElement = $(htmlElement);

    // Show a temporary notification in the corner of the dashboard.
    $.notify(message);

    // Show a notification in the visualization itself.
    $.notify(jqueryElement, {
        message: message,
        stacktrace: stacktrace.replace(/\n/g, "<br/>").replace(/\t/g, "&nbsp; ")
    }, {
        style: "error",
        clickToHide: false,
        autoHide: false,
        arrowShow: false
    });

    // The notification is added as a sibling to the input element.
    var errorNotification = jqueryElement.parent().find(".notifyjs-container");

    error.resizeErrorNotification_(jqueryElement, errorNotification);

    return errorNotification;
};

error.resizeErrorNotification_ = function(jqueryElement, errorNotification) {
    // Resize the notification so its width matches the jqueryElement.  Do this before calculating its height due to wrapping.
    var cssWidth = jqueryElement.outerWidth(true);
    errorNotification.css("width", cssWidth + "px");

    // The notifyjs container element is hidden until its animation finishes so use its child to get its dimensions.
    var cssTop = jqueryElement.outerHeight(true) - errorNotification.find(".notifyjs-error-base").outerHeight(true);

    // The 'top' style of the notifyjs container element gets set by notifyjs to position the notification outside the
    // bottom of the input element.  We instead want to position it inside the bottom of the input element.
    errorNotification.css("top", cssTop + "px");
};

/**
 * Hides the given error message popup and any associated stack trace popup.
 * @param {Object} The jQuery element for the error message.
 */
error.hideErrorMessage = function(errorNotification) {
    var stacktrace = errorNotification.find(".stacktrace");

    if(stacktrace.css("display") !== "none") {
        stacktrace.slideUp();
    }

    errorNotification.trigger("notify-hide");
}

error.hideError_ = function(htmlElement) {
    error.hideErrorMessage($(htmlElement));
};

/**
 * Resizes the error message popup and any associated stack trace popup.
 * @param {HTMLElement} The resized element associated with the error message.
 * @param {Object} The jQuery element for the error message.
 */
error.resizeErrorMessage = function(htmlElement, errorNotification) {
    error.resizeErrorNotification_($(htmlElement), errorNotification);
};

error.toggleStacktrace_ = function(htmlElement) {
    var stacktrace = $(htmlElement).find(".stacktrace");

    if(stacktrace.css("display") !== "none") {
        stacktrace.slideUp();
    }
    else {
        stacktrace.slideDown();
    }
};
