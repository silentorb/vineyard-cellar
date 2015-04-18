/// <reference path="../vineyard/vineyard.d.ts"/>
/// <reference path="../vineyard-lawn/lawn.d.ts"/>
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var Vineyard = require('vineyard');
var Lawn = require('vineyard-lawn');
var uuid = require('node-uuid');
var when = require('when');
var MetaHub = require('vineyard-metahub');

var Cellar = (function (_super) {
    __extends(Cellar, _super);
    function Cellar() {
        _super.apply(this, arguments);
    }
    Cellar.prototype.grow = function () {
        var _this = this;
        var lawn = this.vineyard.bulbs.lawn;
        this.listen(lawn, 'http.start', function (app) {
            return _this.initialize_services(app);
        });
    };

    Cellar.prototype.initialize_services = function (app) {
        var _this = this;
        var multer = require('multer');
        app.use(multer({ dest: this.config.paths.temp }));
        var lawn = this.vineyard.bulbs.lawn;
        lawn.listen_user_http('/vineyard/upload', function (req, res, user) {
            return _this.upload(req, res, user);
        });
        if (this.config.paths.cache && this.config.templates) {
            lawn.listen_user_http('/vineyard/cellar/:template/:guid.:ext', function (req, res, user) {
                return _this.file_download(req, res, user);
            }, 'get');
        }
    };

    Cellar.prototype.upload = function (req, res, user) {
        var _this = this;
        var body = req.body;

        //console.log('files', req.files)
        //console.log('req.body', body)
        var files = req.files.files;
        files = MetaHub.is_array(files) ? files : [files];

        var promises = files.map(function (file) {
            var guid;
            if (body.info) {
                var info = JSON.parse(body.info);
                if (info.guid) {
                    if (!info.guid.match(/[\w\-]+/))
                        throw new HttpError('Invalid guid: ' + info.guid + '.', 400);

                    guid = info.guid;
                }
            }

            guid = guid || uuid.v1();

            var path = require('path');
            var ext = path.extname(file.originalname) || '';
            var filename = guid + ext;
            var filepath = (_this.config.paths.files) + '/' + filename;
            var fs = require('fs');
            fs.rename(file.path, filepath);

            // !!! Add check if file already exists
            return _this.ground.update_object('file', {
                guid: guid,
                name: filename,
                path: file.path,
                size: file.size,
                extension: ext.substring(1),
                status: 1
            }, user);
        });

        return when.all(promises).then(function (objects) {
            res.send({ objects: objects });
            _this.invoke('files.uploaded', objects);
        });
    };

    Cellar.prototype.file_download = function (req, res, user) {
        var _this = this;
        var template_name = req.params.template;
        var guid = req.params.guid;
        var ext = req.params.ext;

        var template = this.config.templates[template_name];
        if (!template)
            throw new HttpError('Invalid template: ' + template_name + '.', 404);

        if (!guid.match(/[\w\-]+/) || !ext.match(/\w+/))
            throw new HttpError('Invalid File Name', 400);

        var path = require('path');
        var template_folder = path.join(this.vineyard.root_path, this.config.paths.cache, template_name);
        var filepath = path.join(template_folder, guid + '.' + ext);

        //console.log(filepath)
        return Cellar.file_exists(filepath).then(function (exists) {
            if (exists) {
                res.sendFile(filepath);
                return;
            }

            var source_file = path.join(_this.vineyard.root_path, _this.config.paths.files, guid + '.' + ext);
            return _this.assure_folder(template_folder).then(function () {
                return Cellar.file_exists(source_file);
            }).then(function (exists) {
                if (!exists)
                    throw new Lawn.HttpError('File Not Found', 404);

                return _this.resize(template, source_file, filepath).then(function () {
                    res.sendFile(filepath);
                });
            });
        });
    };

    Cellar.prototype.assure_folder = function (path) {
        return Cellar.file_exists(path).then(function (exists) {
            if (exists)
                return when.resolve();

            var def = when.defer();
            var fs = require('fs');
            fs.mkdir(path, function (err) {
                def.resolve();
            });
            return def.promise;
        });
    };

    Cellar.prototype.resize = function (template, source, dest) {
        var gm = require('gm');
        var new_width = template.width;
        var new_height = template.height;
        var def = new when.defer();

        gm(source).options({ imageMagick: true }).size(source, function (error, original) {
            var desired_aspect = new_width / new_height;
            var orig_aspect = original.width / original.height;
            var trim;

            var operation = gm(source).options({ imageMagick: true });

            if (desired_aspect > orig_aspect) {
                trim = original.height - (original.width / desired_aspect);
                operation = operation.crop(original.width, original.height - trim, 0, trim / 2);
            } else {
                trim = original.width - (original.height * desired_aspect);
                operation = operation.crop(original.width - trim, original.height, trim / 2, 0);
            }

            operation.resize(new_width, new_height).write(dest, function (err) {
                if (err) {
                    console.error('error writing file ' + dest, err);
                    def.reject(err);
                } else {
                    def.resolve();
                }
            });
        });
        return def.promise;
    };

    Cellar.file_exists = function (filepath) {
        var fs = require('fs'), def = when.defer();
        fs.exists(filepath, function (exists) {
            def.resolve(exists);
        });
        return def.promise;
    };
    return Cellar;
})(Vineyard.Bulb);

module.exports = Cellar;
//# sourceMappingURL=cellar.js.map
