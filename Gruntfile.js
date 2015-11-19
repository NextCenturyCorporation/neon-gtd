'use strict';

module.exports = function(grunt) {
    var packageJSON = require('./package.json');
    var versionJSONFile = 'app/config/version.json';

    var jsLibs = [
        "app/lib/user-ale/js/userale.js",
        "app/lib/user-ale/js/userale-worker.js",
        "app/lib/jquery/js/jquery.min.js",
        "app/lib/opencpu/js/opencpu-0.5.js",
        "app/lib/angular/js/angular.min.js",
        "app/lib/angular-gridster/js/angular-gridster.min.js",
        "app/lib/moment/js/moment.min.js",
        "app/lib/angular-moment/js/angular-moment.min.js",
        "app/lib/angular-gantt/js/angular-gantt.min.js",
        "app/lib/angular-gantt/js/angular-gantt-plugins.min.js",
        "app/lib/angular-route/js/angular-route.min.js",
        "app/lib/angular-ui-tree/js/angular-ui-tree.min.js",
        "app/lib/angular-bootstrap-datetimepicker/js/datetimepicker.js",
        "app/lib/javascript-detect-element-resize/js/jquery.resize.js",
        "app/lib/d3/js/d3.min.js",
        "app/lib/heatmapjs/js/heatmap.min.js",
        "app/js/vendor/openlayers-heatmapjs/heatmap-openlayers.js",
        "app/lib/jquery.tagcloud/js/jquery.tagcloud.js",
        "app/lib/threedubmedia.jquery.event/js/jquery.event.drag.js",
        "app/lib/threedubmedia.jquery.event/js/jquery.event.drop.js",
        "app/lib/jquery.linky/js/jquery.linky.min.js",
        "app/lib/jquery-ui/js/jquery-ui.min.js",
        "app/js/vendor/slick-grid/js/slick.core.js",
        "app/js/vendor/slick-grid/js/slick.grid.js",
        "app/js/vendor/slick-grid/js/slick.dataview.js",
        "app/js/vendor/slick-grid/js/slick.autotooltips.js",
        "app/js/vendor/slick-grid/js/slick.rowselectionmodel.js",
        "app/lib/mergesort/js/merge-sort.js",
        "app/lib/bootstrap/js/bootstrap.min.js",
        "app/lib/js-yaml/js/js-yaml.min.js",
        "app/lib/mustache/js/mustache.min.js",
        "app/lib/ngDraggable/js/ngDraggable.js",
        "app/lib/remarkable-bootstrap-notify/js/bootstrap-notify.min.js",
        "app/lib/rainbowvis.js/js/rainbowvis.js"
    ];

    var jsLibsDest = "app/build/js/neon-dashboard-lib.js";

    grunt.initConfig({
        bower: {
            cleanup: {
                options: {
                    targetDir: "app/lib",
                    layout: "byComponent",
                    cleanTargetDir: true,
                    cleanBowerDir: true,
                    install: false,
                    copy: false
                }
            },
            install: {
                options: {
                    targetDir: "app/lib",
                    layout: "byComponent",
                    cleanTargetDir: true,
                    cleanBowerDir: true,
                    install: true,
                    copy: true
                }
            }
        },

        clean: {
            lib: ["app/lib"],
            docs: ["docs"],
            war: ["target"],
            tests: ["reports"],
            js: ["app/build/js/*.js"],
            css: ["app/build/css/*.css"],
            build: ["app/build"]
        },

        "git-describe": {
            options: {
                failOnError: false
            },
            neonGTDVersion: {
                tags: true,
                all: true,
                template: '{%=tag%}-{%=since%}-{%=object%}'
            }
        },

        uglify: {
            dashboard: {
                options: {
                    mangle: false
                },
                files: [{
                    src: ["app/js/namespaces.js", "app/js/neon-extensions/*.js", "app/js/charts/*.js", "app/js/coremap/*.js", "app/js/mediators/*.js", "app/js/tables/*.js", "app/js/time/*.js", "app/js/app.js", "app/js/*Service.js", "app/js/*Controller.js", "app/js/directives/*.js"],
                    dest: "app/build/js/neon-dashboard.min.js"
                }]
            }
        },

        concat: {
            libs: {
                src: [].concat(jsLibs),
                dest: jsLibsDest
            }
        },

        copy: {
            bootstrap: {
                expand: true,
                cwd: "app/lib/bootstrap/",
                src: ["fonts/**"],
                dest: "app/build/"
            },
            jqueryUiLightness: {
                expand: true,
                cwd: "app/lib/jquery-ui/themes/ui-lightness",
                src: ["images/**"],
                dest: "app/build/css/"
            },
            jqueryUiSmoothness: {
                expand: true,
                cwd: "app/lib/jquery-ui/themes/smoothness",
                src: ["images/**"],
                dest: "app/build/css/"
            },
            slickgrid: {
                expand: true,
                cwd: "app/lib/slickgrid/",
                src: ["css/images/**"],
                dest: "app/build/"
            },
            fonts: {
                expand: true,
                cwd: "app/",
                src: ["fonts/**"],
                dest: "app/build/"
            }
        },

        replace: {
            // Remove the sourceMappingURLs from javascript libraries in the master javascript file.
            sourceMappingUrls: {
                src: [jsLibsDest],
                dest: jsLibsDest,
                replacements: [{
                    from: /\/\/# sourceMappingURL=.*/g,
                    to: ""
                }]
            }
        },

        jshint: {
            options: {
                jshintrc: '.jshintrc',
                force: true
            },
            console: [
                'Gruntfile.js',
                'app/js/*.js',
                'app/js/**/*.js',
                'test/**/*.js',
                '!app/js/vendor/**/*.js'
            ],
            xml: {
                options: {
                    reporter: "jslint",
                    reporterOutput: "reports/jslint.xml"
                },
                files: {
                    src: [
                        'Gruntfile.js',
                        'app/js/*.js',
                        'app/js/**/*.js',
                        'test/**/*.js',
                        '!app/js/vendor/**/*.js'
                    ]
                }
            }
        },

        jscs: {
            options: {
                config: ".jscsrc",
                excludeFiles: ["app/js/vendor/**/*.js"],
                force: true
            },
            console: {
                options: {
                    reporter: 'console'
                },
                files: {
                    src: ['Gruntfile.js', 'app/js/**/*.js', 'test/**/*.js']
                }
            },
            xml: {
                options: {
                    reporterOutput: 'reports/jscs.xml',
                    reporter: 'checkstyle'
                },
                files: {
                    src: ['Gruntfile.js', 'app/js/**/*.js', 'test/**/*.js']
                }
            }
        },

        karma: {
            unit: {
                options: {
                    configFile: 'karma.conf.js'
                }
            }
        },

        less: {
            options: {
                dumpLineNumbers: 'comments',
                paths: [
                    'app/components'
                ]
            },
            nolibs: {
                files: {
                    'app/build/css/neon-dashboard-nolibs.css': 'app/css/app.less'
                }
            },
            dashboard: {
                files: {
                    'app/build/css/neon-dashboard.css': 'app/master.less'
                }
            }
        },

        sprite: {
            dashboard: {
                src: ["app/img/*.png", "app/img/visualizations/*.png"],
                dest: "app/build/img/neon-dashboard-spritesheet.png",
                destCss: "app/build/css/neon-dashboard-sprites.css"
            }
        },

        /*
         * Build a WAR (web archive) without Maven or the JVM installed.
         */
        war: {
            target: {
                options: {
                    war_dist_folder: "target",
                    war_verbose: true,
                    war_name: 'neon-gtd-' + packageJSON.version,
                    webxml_welcome: 'index.html',
                    webxml_display_name: packageJSON.shortDescription,
                    webxml_mime_mapping: [{
                        extension: 'woff',
                        mime_type: 'application/font-woff'
                    }]
                },
                files: [
                    {
                        expand: true,
                        cwd: ".",
                        src: [
                            "app/**",
                            "!**/*.less"],
                        dest: ""
                    }
                ]
            }
        },

        yuidoc: {
            compile: {
                name: packageJSON.shortDescription,
                description: packageJSON.description,
                version: packageJSON.version,
                url: packageJSON.repository.url,
                logo: '../app/img/Neon_60x34.png',
                options: {
                    paths: 'app/js',
                    exclude: "vendor",
                    outdir: 'docs'
                }
            }
        }
    });

    grunt.loadNpmTasks('grunt-bower-task');
    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-less');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-yuidoc');
    grunt.loadNpmTasks('grunt-git-describe');
    grunt.loadNpmTasks('grunt-jscs');
    grunt.loadNpmTasks('grunt-karma');
    grunt.loadNpmTasks('grunt-spritesmith');
    grunt.loadNpmTasks('grunt-text-replace');
    grunt.loadNpmTasks('grunt-war');

    grunt.registerTask('compile-js', ['clean:js', 'uglify', 'concat', 'copy', 'replace']);
    grunt.registerTask('compile-css', ['clean:css', 'less', 'sprite']);
    grunt.registerTask('saveRevision', function() {
        grunt.event.once('git-describe', function(rev) {
            var date = new Date(Date.now()).toISOString();
            date = date.replace(/-/g, '.').replace(/T.*/, '');

            var versionObj = {
                name: packageJSON.name,
                version: packageJSON.version + '-' + rev[2] + '-g' + rev[3] + '-' + date
            };
            grunt.file.write(versionJSONFile, JSON.stringify(versionObj));
        });
        grunt.task.run('git-describe');
    });
    grunt.registerTask('test', ['jshint:console', 'jscs:console', 'karma']);
    grunt.registerTask('default', ['clean', 'bower:install', 'saveRevision', 'compile-js', 'jshint:xml', 'jscs:xml', 'yuidoc', 'compile-css', 'war']);
};
