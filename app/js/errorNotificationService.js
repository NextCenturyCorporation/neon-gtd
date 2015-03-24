'use strict';
/*
 * Copyright 2015 Next Century Corporation
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

angular.module("neonDemo.services")
.factory("ErrorNotificationService",
    function() {
        var service = {};

        // In Bootstrap Notify, {0} = settings.type, {1} = options.title, {2} = options.message, {3} = options.url, {4} = options.target
        var ERROR_AND_PROGRESS_BAR_TEMPLATE =
            "<div data-notify='container' class='alert alert-{0} neon-error-global' role='alert'>" +
                "<button type='button' aria-hidden='true' class='close' data-notify='dismiss'>&times;</button>" +
                "<div>" +
                    "<span class='neon-error-icon' data-notify='icon'></span>" +
                    "<span class='neon-error-message' data-notify='message'>{2}</span>" +
                "</div>" +
                "<div class='progress' data-notify='progressbar'>" +
                    "<div class='progress-bar progress-bar-{0}' role='progressbar' aria-valuenow='0' aria-valuemax='100' style='width: 0%;'></div>" +
                "</div>" +
            "</div>";

        var ERROR_AND_STACKTRACE_TEMPLATE =
            "<div data-notify='container' class='alert alert-{0} neon-error-element' role='alert'>" +
                "<button type='button' aria-hidden='true' class='close' data-notify='dismiss'>&times;</button>" +
                "<div>" +
                    "<span class='neon-error-icon' data-notify='icon'></span>" +
                    "<span class='neon-error-message' data-notify='message'>{2}</span>" +
                "</div>" +
                "<div class='neon-error-details'>Details <i class='glyphicon glyphicon-chevron-up'/></div>" +
                // Use title here for the stacktrace because our options for terminology are limited.
                "<div class='neon-error-stacktrace well' data-notify='title' style='display: none;'>{1}</div>" +
            "</div>";

        /**
         * Hides the given error message notification.
         * @param {Object} The jQuery element for the error message notification.
         */
        service.hideErrorMessage = function(errorNotification) {
            errorNotification.find('[data-notify="dismiss"]').trigger("click");
        }

        /**
         * Shows two error message notifications (one temporary in the corner of the dashboard and the other inside a specified element).
         * @param {HTMLElement} A notification will be displayed inside this element.
         * @param {String} The error message that will be displayed in the notifications.
         * @param {String} The error stacktrace.
         * @return The jQuery element for the error message notification inside the input element.
         */
        service.showErrorMessage = function(element, message, stacktrace) {
            service.hideErrorMessage($(element).find(".neon-error-element"));

            // Display a temporary notification in the corner of the dashboard.
            // Bootstrap Notify Format:  $.notify({ options }, { settings });
            $.notify({
                icon: "img/Error_512x512.png",
                message: message
            }, {
                type: "danger",
                offset: {
                    x: 5,
                    // Include space for the navbar.
                    y: 55
                },
                icon_type: "src",
                template: ERROR_AND_PROGRESS_BAR_TEMPLATE
            });

            // Display a notification in the bottom of the input element.
            $.notify({
                icon: "img/Error_512x512.png",
                // The title property is a keyword that will be used in the template.
                title: stacktrace.replace(/\n/g, "<br/>").replace(/\t/g, "&nbsp; "),
                message: message
            }, {
                // Display inside the input element.
                element: element,
                type: "danger",
                placement: {
                    from: "bottom",
                    align: "center"
                },
                offset: {
                    x: 20,
                    y: 0
                },
                // Display over neon popover elements.
                z_index: 1061,
                // No timeout.
                delay: 0,
                icon_type: "src",
                template: ERROR_AND_STACKTRACE_TEMPLATE
            });

            var elementErrorNotification = $(element).find(".neon-error-element");
            var stacktrace = elementErrorNotification.find(".neon-error-stacktrace");

            // Expand/collapse the stacktrace whenever the user clicks on Details.
            elementErrorNotification.find(".neon-error-details").on("click", function(e) {
                if(stacktrace.css("display") !== "none") {
                    $(this).find("i").removeClass("glyphicon-chevron-down");
                    $(this).find("i").addClass("glyphicon-chevron-up");
                    stacktrace.slideUp();
                } else {
                    $(this).find("i").removeClass("glyphicon-chevron-up");
                    $(this).find("i").addClass("glyphicon-chevron-down");
                    stacktrace.slideDown();
                }
            });

            // Setting the bottom is necessary due to a minor placement bug in Bootstrap Notify.
            elementErrorNotification.css("bottom", "0px");

            return elementErrorNotification;
        };

        return service;
    }
);
